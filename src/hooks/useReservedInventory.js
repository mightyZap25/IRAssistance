import { useState, useEffect } from 'react';
import { productionService } from '../services/productionService';

/**
 * 전사 자재 예약 맵을 관리하는 커스텀 훅
 */
export function useReservedInventory() {
    const [reservedMap, setReservedMap] = useState({});
    const [loading, setLoading] = useState(true);

    const refreshReservedMap = async () => {
        setLoading(true);
        const map = await productionService.fetchReservedMap();
        setReservedMap(map);
        setLoading(false);
    };

    useEffect(() => {
        refreshReservedMap();
    }, []);

    return { reservedMap, loading, refreshReservedMap };
}
