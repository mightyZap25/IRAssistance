import React from 'react';

export default function TextWidget({ 
    user, 
    viewType, 
    customSettings = {}, 
    isEditMode = false,
    onSettingsChange 
}) {
    const { 
        text = '여기에 내용을 입력하세요', 
        fontSize = 14, 
        textColor = '#1e293b', 
        fontFamily = 'sans-serif',
        fontWeight = 'normal',
        textAlign = 'left' 
    } = customSettings;

    if (isEditMode) {
        return (
            <div className="h-full flex flex-col relative">
                <textarea
                    value={text}
                    onChange={(e) => onSettingsChange({ ...customSettings, text: e.target.value })}
                    className="flex-1 w-full p-1 bg-indigo-50/5 dark:bg-indigo-900/5 border-none outline-none resize-none custom-scrollbar"
                    placeholder="내용을 입력하세요..."
                    style={{ 
                        fontSize: `${fontSize}px`, 
                        color: textColor, 
                        fontFamily,
                        fontWeight,
                        textAlign 
                    }}
                />
            </div>
        );
    }

    return (
        <div 
            className="h-full w-full overflow-hidden whitespace-pre-wrap break-words p-1"
            style={{ 
                fontSize: `${fontSize}px`, 
                color: textColor,
                fontFamily,
                fontWeight,
                textAlign: textAlign
            }}
        >
            {text}
        </div>
    );
}
