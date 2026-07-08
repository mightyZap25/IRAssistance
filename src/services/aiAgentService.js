import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

// Initialize Gemini API
const getGenAI = () => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('Gemini API 키가 설정되지 않았습니다. .env 파일에 VITE_GEMINI_API_KEY를 추가해주세요.');
    }
    return new GoogleGenerativeAI(apiKey);
};

const queryDatabaseDeclaration = {
    name: 'query_database',
    description: 'PostgreSQL 데이터베이스(Odoo ERP)에 SQL 쿼리를 실행하여 실제 데이터를 가져옵니다. 반드시 SELECT 쿼리만 사용해야 합니다. 쿼리는 항상 LIMIT 100을 기본으로 적용하여 과부하를 방지하세요.',
    parameters: {
        type: SchemaType.OBJECT,
        properties: {
            sql: {
                type: SchemaType.STRING,
                description: '실행할 PostgreSQL SELECT 쿼리문 (예: SELECT name, list_price FROM product_template ORDER BY list_price DESC LIMIT 5;)',
            },
        },
        required: ['sql'],
    },
};

export const fetchDbSchema = async () => {
    try {
        const response = await fetch('http://localhost:5050/api/sql/schema');
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        return data.schema;
    } catch (err) {
        console.error('Failed to fetch DB schema:', err);
        return null;
    }
};

export const executeSql = async (sql) => {
    try {
        const response = await fetch('http://localhost:5050/api/sql/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql })
        });
        const data = await response.json();
        if (!data.success) {
            return `[오류 발생]: ${data.error}`;
        }
        
        // 반환 데이터가 너무 크면 LLM이 터지므로 문자열을 자릅니다.
        const resultString = JSON.stringify(data.rows);
        if (resultString.length > 30000) {
            return JSON.stringify(data.rows.slice(0, 10)) + "\\n... (데이터가 너무 커서 잘렸습니다. 쿼리의 LIMIT를 더 줄이거나 구체적인 조건을 추가하세요.)";
        }
        return resultString;
    } catch (err) {
        console.error('Failed to execute SQL:', err);
        return `[네트워크 오류 발생]: ${err.message}`;
    }
};

export const createAgentChatSession = async (onStreamUpdate, onToolCall) => {
    const genAI = getGenAI();
    
    // 가져온 스키마 정보를 시스템 프롬프트에 주입
    const schema = await fetchDbSchema();
    let schemaContext = "DB 스키마를 가져올 수 없습니다. 기본적인 Odoo 테이블 구조를 가정하고 쿼리를 작성하세요.";
    if (schema) {
        schemaContext = "현재 사용 가능한 주요 DB 테이블 및 컬럼 구조입니다:\\n" + Object.entries(schema).map(([table, cols]) => {
            return `테이블 [${table}]: ` + cols.map(c => `${c.column}(${c.type})`).join(', ');
        }).join('\\n');
    }

    const systemInstruction = `
당신은 회사의 전사적자원관리(ERP) 데이터를 분석하는 스마트 AI 비서 'IR Assistant' 입니다.
사용자가 데이터를 요구하면, 제공된 \`query_database\` 도구를 사용하여 SQL 쿼리를 실행한 후, 그 결과를 분석하여 자연어로 깔끔하게 대답해야 합니다.

[중요 규칙]
1. 당신은 직접 SQL을 실행할 수 있는 능력이 있습니다. "제가 조회해 드리겠습니다"라고 말하기만 하고 조회를 안 하면 안 됩니다. 반드시 도구를 호출하세요!
2. 질의(SQL) 작성 시 반드시 PostgreSQL 문법을 따르고, 읽기 전용(SELECT)만 사용하세요.
3. 반환되는 데이터가 너무 많지 않도록 항상 LIMIT 10~50 정도를 적절히 사용하세요.
4. 아래 스키마를 참고하여 정확한 테이블과 컬럼명을 사용하세요. Odoo ERP는 보통 product_template, sale_order, stock_move 등의 테이블을 사용합니다.
5. 사용자에게는 SQL 코드나 복잡한 시스템 내부 동작을 그대로 노출하지 말고, 비즈니스 친화적이고 보기 좋은 형태(표나 리스트 등)로 가공해서 친절하게 답변하세요.

${schemaContext}
`;

    // gemini-2.5-flash 모델 사용 (Function calling 지원)
    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash",
        systemInstruction,
        tools: [{
            functionDeclarations: [queryDatabaseDeclaration]
        }],
    });

    const chat = model.startChat();

    const sendMessage = async (userMessage) => {
        let result = await chat.sendMessage(userMessage);
        
        let callCount = 0;
        
        // 모델이 도구 호출(Function Call)을 원할 경우 반복 처리
        while (result.response.functionCalls() && result.response.functionCalls().length > 0 && callCount < 3) {
            callCount++;
            const call = result.response.functionCalls()[0];
            
            if (call.name === 'query_database') {
                const sql = call.args.sql;
                console.log('[Agent] AI requested SQL execution:', sql);
                
                // UI 쪽에 상태 알림 (예: "DB에서 품목 데이터를 검색 중입니다...")
                if (onToolCall) onToolCall(sql);
                
                // 실제 DB 조회
                const dbResult = await executeSql(sql);
                
                // 결과를 모델에게 다시 전달
                result = await chat.sendMessage([{
                    functionResponse: {
                        name: 'query_database',
                        response: { result: dbResult }
                    }
                }]);
            }
        }
        
        return result.response.text();
    };

    return { sendMessage };
};
