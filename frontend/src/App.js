import React, { useEffect, useState, useRef } from 'react';
import {
  AppBar, Toolbar, Typography, Container, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, IconButton, List, ListItem, ListItemText, ListItemSecondaryAction, Paper, Box, Tabs, Tab,
  Checkbox, Link as MuiLink, InputAdornment, CircularProgress, Snackbar, Alert, Grid, MenuItem
} from '@mui/material';
import { Add, Delete, Edit, Save, UploadFile, DragIndicator } from '@mui/icons-material';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import axios from 'axios';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import debounce from 'lodash.debounce';

function App() {
  const [tab, setTab] = useState(0);
  const [runbooks, setRunbooks] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 创建API实例
  const api = axios.create({
    baseURL: '/api'
  });

  // Runbook Dialog
  const [openRunbookDialog, setOpenRunbookDialog] = useState(false);
  const [editingRunbook, setEditingRunbook] = useState(null);

  // Execution Dialog
  const [openExecDialog, setOpenExecDialog] = useState(false);
  const [selectedRunbookId, setSelectedRunbookId] = useState(null);
  const [selectedExecution, setSelectedExecution] = useState(null);
  const [openExecDetail, setOpenExecDetail] = useState(false);
  
  // 添加备注文本状态
  const [remarkTexts, setRemarkTexts] = useState({});
  const [pendingRemarkUpdates, setPendingRemarkUpdates] = useState({});

  // Snackbar状态
  const [snackbar, setSnackbar] = useState({ open: false, message: '' });

  // 1. 执行弹窗表单状态
  const [execForm, setExecForm] = useState({ incidentId: '', operator: '', priority: '中' });

  // 计算派生状态
  const selectedRunbook = runbooks.find(rb => rb._id === selectedRunbookId);
  const filteredExecutions = executions.filter(e => e.runbookId === (selectedRunbook?._id || ''));

  // React Hook Form for Runbook editing
  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors }
  } = useForm({
    defaultValues: {
      title: '',
      description: '',
      steps: []
    }
  });

  // Field array for steps
  const { fields, move, append, remove } = useFieldArray({
    control,
    name: 'steps'
  });

  // 为执行记录详情创建一个独立的表单控制
  const {
    control: executionControl,
    handleSubmit: handleExecutionSubmit,
    reset: resetExecutionForm,
    setValue: setExecutionValue,
    watch: watchExecution
  } = useForm({
    defaultValues: {
      steps: []
    }
  });
  
  // 用于存储待处理的备注更新定时器
  const pendingRemarkTimeouts = useRef({});
  
  // 清理定时器
  useEffect(() => {
    return () => {
      Object.values(pendingRemarkTimeouts.current).forEach(timeout => clearTimeout(timeout));
    };
  }, []);

  // 当选择的执行记录改变时，重置表单
  useEffect(() => {
    if (selectedExecution) {
      const stepDefaults = selectedExecution.steps.map(step => ({
        remarkText: step.remarkText || '',
        remarkImage: step.remarkImage || ''
      }));
      resetExecutionForm({ steps: stepDefaults });
    }
  }, [selectedExecution, resetExecutionForm]);

  // 加载数据
  useEffect(() => {
    fetchRunbooks();
    fetchExecutions();
  }, []);

  const fetchRunbooks = async () => {
    setLoading(true);
    try {
      const res = await api.get('/runbooks');
      setRunbooks(res.data);
    } catch (e) {
      setError('加载Runbook失败');
    } finally {
      setLoading(false);
    }
  };
  const fetchExecutions = async () => {
    try {
      const res = await api.get('/executions');
      setExecutions(res.data);
    } catch (e) {
      setError('加载执行记录失败');
    }
  };

  // 2. 打开详情弹窗
  const handleViewExecution = (exec) => {
    setSelectedExecution(exec);
    // 初始化备注文本的本地状态
    const initialRemarkTexts = {};
    const initialPendingRemarkUpdates = {};
    exec.steps.forEach((step, index) => {
      initialRemarkTexts[index] = step.remarkText || '';
      initialPendingRemarkUpdates[index] = step.remarkText || '';
    });
    setRemarkTexts(initialRemarkTexts);
    setPendingRemarkUpdates(initialPendingRemarkUpdates);
    
    // 初始化执行记录详情表单
    const stepDefaults = exec.steps.map(step => ({
      remarkText: step.remarkText || '',
      remarkImage: step.remarkImage || ''
    }));
    resetExecutionForm({ steps: stepDefaults });
    
    setOpenExecDetail(true);
  };

  // 3. 步骤勾选、备注、图片 PATCH
  const handleStepUpdate = async (stepIdx, patch) => {
    if (!selectedExecution) return;
    
    // 对于勾选框更新，立即发送请求
    if (patch.checked !== undefined) {
      setLoading(true);
      try {
        const res = await api.patch(`/executions/${selectedExecution._id}/step/${stepIdx}`, patch);
        setSelectedExecution(res.data);
        fetchExecutions();
        // 如果是最后一步且已全部勾选，自动 PATCH finishedAt
        const allChecked = res.data.steps.every(s => s.checked);
        if (allChecked && !res.data.finishedAt) {
          await api.put(`/executions/${selectedExecution._id}`, { ...res.data, finishedAt: new Date() });
          fetchExecutions();
        }
      } finally {
        setLoading(false);
      }
    } else {
      // 对于备注文本更新，添加到批量更新队列
      addToBatchUpdate(stepIdx, patch);
    }
  };

  // 批量更新队列
  const batchUpdateQueue = useRef([]);

  // 添加到批量更新队列
  const addToBatchUpdate = (stepIdx, patch) => {
    const queue = batchUpdateQueue.current;
    
    // 检查是否已存在对该步骤的更新，如果有则替换
    const existingIndex = queue.findIndex(item => item.stepIdx === stepIdx);
    if (existingIndex >= 0) {
      queue[existingIndex] = { stepIdx, patch };
    } else {
      queue.push({ stepIdx, patch });
    }
    
    // 触发防抖批量更新
    debouncedBatchUpdate.current();
  };

  // 防抖批量更新函数
  const debouncedBatchUpdate = useRef(null);

  useEffect(() => {
    // 初始化debounced函数
    debouncedBatchUpdate.current = debounce(async () => {
      if (!selectedExecution || batchUpdateQueue.current.length === 0) return;
      
      try {
        const updates = [...batchUpdateQueue.current];
        batchUpdateQueue.current = []; // 清空队列
        
        const res = await api.patch(`/executions/${selectedExecution._id}/steps/batch`, { updates });
        setSelectedExecution(res.data);
        fetchExecutions();
      } catch (error) {
        console.error('批量更新备注失败:', error);
      }
    }, 300); // 缩短防抖时间到300ms

    // 清理函数
    return () => {
      if (debouncedBatchUpdate.current) {
        debouncedBatchUpdate.current.cancel();
      }
    };
  }, [selectedExecution]);

  // 保存Runbook
  const onSubmitRunbook = async (data) => {
    setLoading(true);
    try {
      if (editingRunbook) {
        await api.put(`/runbooks/${editingRunbook._id}`, data);
        setSnackbar({ open: true, message: 'Runbook已更新', severity: 'success' });
      } else {
        await api.post('/runbooks', data);
        setSnackbar({ open: true, message: 'Runbook已创建', severity: 'success' });
      }
      setOpenRunbookDialog(false);
      fetchRunbooks();
    } catch (e) {
      setSnackbar({ open: true, message: '保存失败', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRunbook = async (id) => {
    if (!window.confirm('确定删除该Runbook？')) return;
    setLoading(true);
    try {
      await api.delete(`/runbooks/${id}`);
      setSnackbar({ open: true, message: 'Runbook已删除', severity: 'success' });
      fetchRunbooks();
    } catch (e) {
      setSnackbar({ open: true, message: '删除失败', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleExecSubmit = async () => {
    if (!selectedRunbook) return;
    setLoading(true);
    try {
      const res = await api.post('/executions', {
        runbookId: selectedRunbook._id,
        runbookTitle: selectedRunbook.title,
        incidentId: execForm.incidentId,
        operator: execForm.operator,
        priority: execForm.priority
      });
      setSnackbar({ open: true, message: '执行记录已创建', severity: 'success' });
      setOpenExecDialog(false);
      fetchExecutions();
      setSelectedExecution(res.data); // 自动弹出详情
      
      // 初始化备注文本的本地状态
      const initialRemarkTexts = {};
      const initialPendingRemarkUpdates = {};
      res.data.steps.forEach((step, index) => {
        initialRemarkTexts[index] = step.remarkText || '';
        initialPendingRemarkUpdates[index] = step.remarkText || '';
      });
      setRemarkTexts(initialRemarkTexts);
      setPendingRemarkUpdates(initialPendingRemarkUpdates);
      
      // 初始化执行记录详情表单
      const stepDefaults = res.data.steps.map(step => ({
        remarkText: step.remarkText || '',
        remarkImage: step.remarkImage || ''
      }));
      resetExecutionForm({ steps: stepDefaults });
      
      setOpenExecDetail(true);
    } catch (e) {
      setSnackbar({ open: true, message: '创建执行记录失败', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleStepImageUpload = async (file, stepIdx) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      // 更新表单值
      setValue(`steps.${stepIdx}.image`, res.data.url);
    } catch (e) {
      setSnackbar({ open: true, message: '上传图片失败', severity: 'error' });
    }
  };

  return (
    <Box>
      <AppBar position="fixed" sx={{ 
        zIndex: (theme) => theme.zIndex.drawer + 1,
        height: 64,
        justifyContent: 'center'
      }}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Runbook MVP</Typography>
        </Toolbar>
      </AppBar>
      <Container sx={{ mt: '80px', pt: 2 }} maxWidth="xl">
        <Grid container spacing={2}>
          {/* 左侧菜单栏：Runbook卡片列表 */}
          <Grid item xs={12} md={4} lg={3}>
            <Button variant="contained" startIcon={<Add />} sx={{ mb: 2 }} fullWidth onClick={() => { setEditingRunbook(null); setOpenRunbookDialog(true); }}>新建Runbook</Button>
            <DragDropContext onDragEnd={result => {
              if (!result.destination) return;
              const items = Array.from(runbooks);
              const [reorderedItem] = items.splice(result.source.index, 1);
              items.splice(result.destination.index, 0, reorderedItem);
              setRunbooks(items);
            }}>
              <Droppable droppableId="runbooks">
                {(provided) => (
                  <Box {...provided.droppableProps} ref={provided.innerRef} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {runbooks.map((rb, index) => (
                      <Draggable key={rb._id} draggableId={rb._id} index={index}>
                        {(provided) => (
                          <Paper 
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            elevation={selectedRunbookId === rb._id ? 6 : 1} 
                            sx={{ 
                              p: 2,
                              border: selectedRunbookId === rb._id ? '2px solid #1976d2' : '1px solid #eee',
                              cursor: 'pointer',
                              transition: '0.2s',
                              display: 'flex',
                              flexDirection: 'column'
                            }} 
                            onClick={() => setSelectedRunbookId(rb._id)}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                              <Box {...provided.dragHandleProps} sx={{ mr: 1 }}>
                                <DragIndicator />
                              </Box>
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="h6" noWrap>{rb.title}</Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }} noWrap>{rb.description}</Typography>
                              </Box>
                            </Box>
                            <Box sx={{ 
                              display: 'flex', 
                              gap: 1, 
                              flexWrap: 'wrap',
                              justifyContent: 'flex-end',
                              mt: 2
                            }}>
                              <Button size="small" variant="outlined" onClick={e => { e.stopPropagation(); setEditingRunbook(rb); setOpenRunbookDialog(true); }}>编辑</Button>
                              <Button size="small" variant="outlined" color="error" onClick={e => { e.stopPropagation(); handleDeleteRunbook(rb._id); }}>删除</Button>
                              <Button size="small" variant="outlined" onClick={e => { e.stopPropagation(); setSelectedRunbookId(rb._id); setOpenExecDialog(true); }}>执行</Button>
                              <Button size="small" variant="outlined" onClick={e => { e.stopPropagation(); setEditingRunbook(rb); setOpenRunbookDialog(true); }}>查看</Button>
                            </Box>
                          </Paper>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </Box>
                )}
              </Droppable>
            </DragDropContext>
          </Grid>
          {/* 右侧：执行记录列表 */}
          <Grid item xs={12} md={8} lg={9}>
            <Typography variant="h6" sx={{ mb: 2 }}>执行记录（{selectedRunbook?.title || ''}）</Typography>
            <Paper>
              <List>
                {filteredExecutions.length === 0 && <ListItem><ListItemText primary="暂无执行记录" /></ListItem>}
                {filteredExecutions.map((exec, index) => {
                  let resolved = '';
                  if (exec.finishedAt && exec.startedAt) {
                    const sec = Math.round((new Date(exec.finishedAt) - new Date(exec.startedAt)) / 1000);
                    resolved = sec < 60 ? `耗时：${sec}秒` : `耗时：${Math.floor(sec/60)}分${sec%60}秒`;
                  }
                  return (
                    <ListItem key={exec._id} divider>
                      <ListItemText
                        primary={exec.runbookTitle + (exec.incidentId ? `（${exec.incidentId}）` : '')}
                        secondary={`操作人: ${exec.operator || '-'} | 优先级: ${exec.priority || '-'} | 开始: ${exec.startedAt ? new Date(exec.startedAt).toLocaleString() : '-'}${resolved ? ' | ' + resolved : ''}`}
                      />
                      <Button size="small" onClick={() => handleViewExecution(exec)}>查看</Button>
                      <Button size="small" onClick={() => handleViewExecution(exec)}>编辑</Button>
                    </ListItem>
                  );
                })}
              </List>
            </Paper>
          </Grid>
        </Grid>
      </Container>
      {/* 其它弹窗和功能保持不变 */}
      {/* 在 return 语句后面添加 Runbook 弹窗 */}
      <Dialog open={openRunbookDialog} onClose={() => setOpenRunbookDialog(false)} maxWidth="md" fullWidth sx={{ '& .MuiDialog-container': { mt: 8 } }}>
        <DialogTitle>{editingRunbook ? '编辑Runbook' : '新建Runbook'}</DialogTitle>
        <DialogContent>
          <Box component="form" onSubmit={handleSubmit(onSubmitRunbook)}>
            <Controller
              name="title"
              control={control}
              rules={{ required: '标题必填' }}
              render={({ field }) => (
                <TextField {...field} label="标题" fullWidth margin="normal" error={!!errors.title} helperText={errors.title?.message} />
              )}
            />
            <Controller
              name="description"
              control={control}
              render={({ field }) => (
                <TextField {...field} label="描述" fullWidth margin="normal" multiline rows={2} />
              )}
            />
            <Typography variant="subtitle1" sx={{ mt: 2 }}>Checklist 步骤</Typography>
            <DragDropContext onDragEnd={result => {
              if (!result.destination) return;
              move(result.source.index, result.destination.index);
            }}>
              <Droppable droppableId="steps-droppable">
                {(provided) => (
                  <List ref={provided.innerRef} {...provided.droppableProps}>
                    {fields.map((item, idx) => (
                      <Draggable key={item.id} draggableId={item.id} index={idx}>
                        {(provided, snapshot) => (
                          <ListItem ref={provided.innerRef} {...provided.draggableProps} divider alignItems="flex-start"
                            secondaryAction={
                              <IconButton edge="end" color="error" onClick={() => remove(idx)}><Delete /></IconButton>
                            }
                          >
                            <Box {...provided.dragHandleProps} sx={{ mr: 1, mt: 2 }}><DragIndicator /></Box>
                            <Grid container spacing={1} alignItems="center">
                              <Grid item xs={12} sm={4}>
                                <Controller
                                  name={`steps.${idx}.text`}
                                  control={control}
                                  rules={{ required: '步骤内容必填' }}
                                  render={({ field }) => (
                                    <TextField {...field} label={`步骤${idx + 1}内容`} fullWidth error={!!errors.steps?.[idx]?.text} helperText={errors.steps?.[idx]?.text?.message} />
                                  )}
                                />
                              </Grid>
                              <Grid item xs={12} sm={4}>
                                <Controller
                                  name={`steps.${idx}.link`}
                                  control={control}
                                  render={({ field }) => (
                                    <TextField {...field} label="超链接（可选）" fullWidth />
                                  )}
                                />
                              </Grid>
                              <Grid item xs={12} sm={3}>
                                <Controller
                                  name={`steps.${idx}.image`}
                                  control={control}
                                  render={({ field }) => (
                                    <Box>
                                      <Button component="label" startIcon={<UploadFile />} size="small">
                                        {field.value ? '更换图片' : '上传图片'}
                                        <input type="file" hidden accept="image/*" onChange={e => {
                                          if (e.target.files?.[0]) handleStepImageUpload(e.target.files[0], idx);
                                        }} />
                                      </Button>
                                      {field.value && (
                                        <MuiLink href={field.value} target="_blank" sx={{ ml: 1 }}>预览</MuiLink>
                                      )}
                                    </Box>
                                  )}
                                />
                              </Grid>
                            </Grid>
                          </ListItem>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </List>
                )}
              </Droppable>
            </DragDropContext>
            <Button variant="outlined" startIcon={<Add />} sx={{ mt: 2 }} onClick={() => append({ text: '', link: '', image: '' })}>添加步骤</Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenRunbookDialog(false)}>取消</Button>
          <Button onClick={handleSubmit(onSubmitRunbook)} variant="contained">保存</Button>
        </DialogActions>
      </Dialog>
      {/* 在 return 末尾添加执行弹窗 */}
      <Dialog open={openExecDialog} onClose={() => setOpenExecDialog(false)} maxWidth="xs" fullWidth sx={{ '& .MuiDialog-container': { mt: 8 } }}>
        <DialogTitle>新建执行记录</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField label="事件ID" value={execForm.incidentId} onChange={e => setExecForm(f => ({ ...f, incidentId: e.target.value }))} fullWidth />
            <TextField label="操作人" value={execForm.operator} onChange={e => setExecForm(f => ({ ...f, operator: e.target.value }))} fullWidth />
            <TextField label="优先级" select value={execForm.priority} onChange={e => setExecForm(f => ({ ...f, priority: e.target.value }))} fullWidth>
              <MenuItem value="高">高</MenuItem>
              <MenuItem value="中">中</MenuItem>
              <MenuItem value="低">低</MenuItem>
            </TextField>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenExecDialog(false)}>取消</Button>
          <Button onClick={handleExecSubmit} variant="contained">提交</Button>
        </DialogActions>
      </Dialog>
      {/* 详情弹窗 */}
      <Dialog open={openExecDetail && !!selectedExecution} onClose={() => setOpenExecDetail(false)} maxWidth="md" fullWidth sx={{ '& .MuiDialog-container': { mt: 8 } }}>
        <DialogTitle>执行记录详情</DialogTitle>
        <DialogContent>
          {selectedExecution && (
            <Box>
              <Typography variant="subtitle1">Runbook: {selectedExecution.runbookTitle}</Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>操作人: {selectedExecution.operator} | 优先级: {selectedExecution.priority} | 开始: {selectedExecution.startedAt ? new Date(selectedExecution.startedAt).toLocaleString() : '-'}
                {selectedExecution.finishedAt && selectedExecution.startedAt && (
                  <span> | 结束: {new Date(selectedExecution.finishedAt).toLocaleString()} | 耗时: {(() => { const sec = Math.round((new Date(selectedExecution.finishedAt) - new Date(selectedExecution.startedAt)) / 1000); return sec < 60 ? `${sec}秒` : `${Math.floor(sec/60)}分${sec%60}秒`; })()}</span>
                )}
              </Typography>
              <List>
                {selectedExecution.steps.map((step, idx) => (
                  <ListItem key={idx} alignItems="flex-start" divider>
                    <Checkbox checked={!!step.checked} onChange={e => handleStepUpdate(idx, { checked: e.target.checked })} />
                    <Box sx={{ flex: 1 }}>
                      {step.link ? <MuiLink href={step.link} target="_blank">{step.text}</MuiLink> : <Typography>{step.text}</Typography>}
                      <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
                        {step.executedAt && <Typography variant="caption" color="text.secondary">执行时间: {new Date(step.executedAt).toLocaleString()}</Typography>}
                        {/* 使用react-hook-form管理备注输入 */}
                        <Controller
                          name={`steps.${idx}.remarkText`}
                          control={executionControl}
                          render={({ field }) => {
                            const [isComposing, setIsComposing] = useState(false);
                            return (
                              <TextField 
                                {...field}
                                size="small" 
                                label="备注" 
                                sx={{ width: 200 }}
                                onCompositionStart={() => setIsComposing(true)}
                                onCompositionEnd={() => {
                                  setIsComposing(false);
                                  // 中文输入完成后再触发更新
                                  handleStepUpdate(idx, { remarkText: field.value });
                                }}
                                onChange={(e) => {
                                  field.onChange(e);
                                  // 非中文输入时立即触发更新
                                  if (!isComposing) {
                                    handleStepUpdate(idx, { remarkText: e.target.value });
                                  }
                                }}
                              />
                            );
                          }}
                        />
                        <Button component="label" startIcon={<UploadFile />} size="small">
                          {step.remarkImage ? '更换图片' : '上传图片'}
                          <input type="file" hidden accept="image/*" onChange={async e => {
                            if (e.target.files?.[0]) {
                              const formData = new FormData();
                              formData.append('file', e.target.files[0]);
                              const res = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
                              // 更新表单值
                              setExecutionValue(`steps.${idx}.remarkImage`, res.data.url);
                              // 同时更新服务器
                              handleStepUpdate(idx, { remarkImage: res.data.url });
                            }
                          }} />
                        </Button>
                        {step.remarkImage && <MuiLink href={step.remarkImage} target="_blank">图片预览</MuiLink>}
                      </Box>
                    </Box>
                  </ListItem>
                ))}
              </List>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenExecDetail(false)}>关闭</Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar(s => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity={snackbar.severity || 'info'} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default App;