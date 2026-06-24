import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Lightbulb } from 'lucide-react';

// 실제 화면 상에 뷰포트 내에 렌더링되어 표시 중인지 가볍게 확인하는 함수 (Reflow 최소화)
const isElementVisibleAndNotObstructed = (el, rect) => {
    if (rect.width <= 0 || rect.height <= 0) return false;

    // 뷰포트 경계 내에 있는지 빠르게 체크 (Reflow 없음)
    if (
        rect.bottom < 0 ||
        rect.top > window.innerHeight ||
        rect.right < 0 ||
        rect.left > window.innerWidth
    ) {
        return false;
    }

    // offsetParent가 null이라는 것은 display: none이거나 DOM 트리상 숨겨져 있음을 의미 (Reflow 유발하지 않는 가벼운 체크)
    // 단, position: fixed 요소는 offsetParent가 null일 수 있으므로 style.position도 함께 인라인 체크
    if (el.offsetParent === null && el.style.position !== 'fixed') {
        return false;
    }

    return true;
};


export default function ScreenHintManager({ showScreenHints, onTriggerSingleTour, hintNumbers = {} }) {
    const [targets, setTargets] = useState([]);
    const observerRef = useRef(null);

    // Scan for all DOM elements with [data-tour] attribute
    const scanTourTargets = () => {
        if (!showScreenHints) {
            setTargets([]);
            return;
        }

        const elements = document.querySelectorAll('[data-tour]');
        const detected = [];

        elements.forEach(el => {
            const tourKey = el.getAttribute('data-tour');
            const rect = el.getBoundingClientRect();
            
            // Only add if element is visible on screen and not obstructed by panels
            if (isElementVisibleAndNotObstructed(el, rect)) {
                detected.push({
                    key: tourKey,
                    rect: {
                        x: rect.left,
                        y: rect.top,
                        width: rect.width,
                        height: rect.height,
                        top: rect.top + window.scrollY,
                        left: rect.left + window.scrollX
                    }
                });
            }
        });

        console.log(`[ScreenHintManager] 스캔됨: ${elements.length}개 요소 중 ${detected.length}개 활성화 (키: ${detected.map(d => d.key).join(', ')})`);

        // Simple comparison to prevent infinite rendering loops
        setTargets(prev => {
            if (prev.length === detected.length && 
                prev.every((p, i) => p.key === detected[i].key && 
                    Math.abs(p.rect.x - detected[i].rect.x) < 2 &&
                    Math.abs(p.rect.y - detected[i].rect.y) < 2)) {
                return prev;
            }
            return detected;
        });
    };

    useEffect(() => {
        console.log(`[ScreenHintManager] showScreenHints 변경됨: ${showScreenHints}`);
        if (!showScreenHints) {
            setTargets([]);
            return;
        }

        // requestAnimationFrame을 활용해 중복 및 밀집 렌더링 호출을 스케줄링하는 쓰로틀러
        let rafId = null;
        const triggerThrottledScan = () => {
            if (rafId) return;
            rafId = requestAnimationFrame(() => {
                scanTourTargets();
                rafId = null;
            });
        };

        // Initial scan
        triggerThrottledScan();

        // 1. Scan periodically to catch newly rendered items or page changes
        const interval = setInterval(triggerThrottledScan, 500);

        // 2. Listen to scroll/resize events with throttling
        window.addEventListener('resize', triggerThrottledScan);
        window.addEventListener('scroll', triggerThrottledScan, true); // capture phase to handle nested scrolling

        return () => {
            clearInterval(interval);
            if (rafId) cancelAnimationFrame(rafId);
            window.removeEventListener('resize', triggerThrottledScan);
            window.removeEventListener('scroll', triggerThrottledScan, true);
        };
    }, [showScreenHints]);

    if (!showScreenHints || targets.length === 0) return null;

    return createPortal(
        <div className="fixed inset-0 pointer-events-none z-[980] no-print">
            <style>{`
                @keyframes pulse-hint {
                    0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.6); }
                    50% { transform: scale(1.05); box-shadow: 0 0 8px 3px rgba(99, 102, 241, 0.35); }
                }
                .animate-pulse-hint {
                    animation: pulse-hint 2s infinite ease-in-out;
                }
            `}</style>
            
            {targets.map(target => {
                const displayNum = hintNumbers && hintNumbers[target.key];
                
                // displayNum 길이(글자 수)에 따라 가로 너비 유동적 설정
                const isLongText = displayNum && displayNum.length > 2;
                const badgeWidth = isLongText ? 34 : 24;
                const badgeHeight = 24;

                const badgeTop = target.rect.y - (badgeHeight / 2);
                const badgeLeft = target.rect.x + target.rect.width - (badgeWidth / 2) - 2;

                // Make sure badge stays within screen boundaries
                const top = Math.max(10, Math.min(badgeTop, window.innerHeight - 30));
                const left = Math.max(10, Math.min(badgeLeft, window.innerWidth - 30));

                return (
                    <div
                        key={target.key}
                        style={{
                            position: 'fixed',
                            top: `${top}px`,
                            left: `${left}px`,
                            width: `${badgeWidth}px`,
                            height: `${badgeHeight}px`,
                            zIndex: 985
                        }}
                        className="pointer-events-auto"
                    >
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onTriggerSingleTour(target.key);
                            }}
                            className={`w-full h-full ${isLongText ? 'rounded-xl px-1' : 'rounded-full'} bg-indigo-650 hover:bg-indigo-700 text-white flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-all animate-pulse-hint group`}
                            title="설명 보기"
                        >
                            {displayNum ? (
                                <span className="text-[10px] font-black text-white leading-none tracking-tighter shrink-0 select-none">
                                    {displayNum}
                                </span>
                            ) : (
                                <Lightbulb size={12} className="text-white group-hover:rotate-12 transition-transform shrink-0" />
                            )}
                            
                            {/* Inner Ring Glow */}
                            <span className="absolute -inset-0.5 rounded-full border border-indigo-400 opacity-0 group-hover:opacity-100 animate-ping pointer-events-none" />
                        </button>
                    </div>
                );
            })}
        </div>,
        document.body
    );
}
