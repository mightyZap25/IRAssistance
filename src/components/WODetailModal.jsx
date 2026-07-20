import React, { useState, useEffect } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, 
  Button, TextField, Typography, Box, Grid, Divider,
  Alert, LinearProgress
} from '@mui/material';
import { 
  collection, addDoc, doc, updateDoc, 
  getDocs, query, where, serverTimestamp, increment 
} from 'firebase/firestore';
import { db } from '../database';

const WODetailModal = ({ open, onClose, woData, onSave }) => {
  const [actualQty, setActualQty] = useState(0);
  const [defectQty, setDefectQty] = useState(0);
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (woData) {
      setActualQty(woData.quantity || 0);
      setDefectQty(0);
      setRemarks('');
      setError(null);
    }
  }, [woData]);

  const handleSubmit = async () => {
    if (actualQty <= 0) {
      setError('생산 수량은 0보다 커야 합니다.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // 1. 실적 기록 (productionLogs)
      await addDoc(collection(db, 'productionLogs'), {
        prId: woData.prId,
        itemIndex: woData.itemIndex,
        productName: woData.productName,
        actualQty,
        defectQty,
        remarks,
        timestamp: serverTimestamp(),
        worker: '현장 작업자' // 로그인 정보가 있으면 교체 가능
      });

      // 2. QA 검사 요청 생성 (shipping/receiving 컬렉션)
      await addDoc(collection(db, 'receiving'), {
        type: 'SHIPPING',
        status: 'WAITING_INSPECTION',
        prId: woData.prId,
        productName: woData.productName,
        quantity: actualQty,
        createdAt: serverTimestamp()
      });

      // 3. 재고 차감 (Backflushing 로직 - 간단 구현)
      // 실제로는 BOM 정보를 가져와서 모든 하위 부품의 재고를 차감해야 함
      // 여기서는 성공 알림을 위해 onSave 호출
      
      if (onSave) {
        await onSave({ actualQty, defectQty, remarks });
      }
      
      onClose();
    } catch (err) {
      console.error('Error saving production result:', err);
      setError('실적 저장 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!woData) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ bgcolor: '#f5f5f5', fontWeight: 'bold' }}>
        생산 완료 실적 보고
      </DialogTitle>
      <DialogContent sx={{ mt: 2 }}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="caption" color="textSecondary">프로젝트</Typography>
          <Typography variant="body1" fontWeight="bold">{woData.projectName || '미지정 프로젝트'}</Typography>
        </Box>
        <Box sx={{ mb: 3 }}>
          <Typography variant="caption" color="textSecondary">생산 제품 (항목)</Typography>
          <Typography variant="body1">{woData.productName} ({woData.quantity} EA)</Typography>
        </Box>
        
        <Divider sx={{ my: 2 }} />
        
        <Grid container spacing={2}>
          <Grid item xs={6}>
            <TextField
              fullWidth
              label="양품 생산 수량"
              type="number"
              value={actualQty}
              onChange={(e) => setActualQty(Number(e.target.value))}
              size="small"
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              fullWidth
              label="불량 수량"
              type="number"
              value={defectQty}
              onChange={(e) => setDefectQty(Number(e.target.value))}
              size="small"
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="작업 비고"
              multiline
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="특이사항이 있는 경우 입력해 주세요."
            />
          </Grid>
        </Grid>

        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        {submitting && <LinearProgress sx={{ mt: 2 }} />}
      </DialogContent>
      <DialogActions sx={{ p: 2, bgcolor: '#f5f5f5' }}>
        <Button onClick={onClose} color="inherit" disabled={submitting}>취소</Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained" 
          color="success" 
          disabled={submitting}
        >
          실적 저장 및 완료
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default WODetailModal;
