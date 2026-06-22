export const nasDbService = {
    // 특정 컬렉션의 모든 문서 조회
    getAll: async (collectionName) => {
        try {
            const res = await fetch(`/api/db/${collectionName}`);
            if (!res.ok) throw new Error(`Failed to fetch ${collectionName}`);
            return await res.json();
        } catch (err) {
            console.error(err);
            return []; // 실패 시 빈 배열 반환하여 앱 다운 방지
        }
    },

    // 단일 문서 조회
    getOne: async (collectionName, id) => {
        try {
            const res = await fetch(`/api/db/${collectionName}/${id}`);
            if (!res.ok) throw new Error(`Failed to fetch ${collectionName}/${id}`);
            return await res.json();
        } catch (err) {
            console.error(err);
            return null;
        }
    },

    // 문서 생성 또는 업데이트 (Upsert)
    upsert: async (collectionName, id, data) => {
        const res = await fetch(`/api/db/${collectionName}/${id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error(`Failed to upsert ${collectionName}/${id}`);
        return await res.json();
    },

    // 문서 삭제
    delete: async (collectionName, id) => {
        const res = await fetch(`/api/db/${collectionName}/${id}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error(`Failed to delete ${collectionName}/${id}`);
        return await res.json();
    }
};
