import React, { useEffect, useState } from 'react';
import {
  AppBar, Toolbar, Typography, Container, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, IconButton, List, ListItem, ListItemText, ListItemSecondaryAction, Paper, Box, Tabs, Tab,
  Checkbox, Link as MuiLink, InputAdornment, CircularProgress, Snackbar, Alert, Grid, MenuItem
} from '@mui/material';
import { Add, Delete, Edit, Save, UploadFile, DragIndicator } from '@mui/icons-material';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import axios from 'axios';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';

function App() {
  const [tab, setTab] = useState(0);
  const [runbooks, setRunbooks] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Runbook Dialog
  const [openRunbookDialog, setOpenRunbookDialog] = useState(false);
  const [editingRunbook, setEditingRunbook] = useState(null);

  // Execution Dialog
  const [openExecDialog, setOpenExecDialog] = useState(false);
  const [selectedRunbookId, setSelectedRunbookId] = useState(null);
  const [selectedExecution, setSelectedExecution] = useState(null);

  // 1. 执行记录详情弹窗状态
  const [openExecDetail, setOpenExecDetail] = useState(false);

  // Snackbar
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // API base
  const api = axios.create({ baseURL: '/api' });

  // Runbook 新建/编辑弹窗及 Checklist 步骤编辑
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
  const { fields, append, remove, move } = useFieldArray({ control, name: 'steps' });

  // 1. 新增选中Runbook状态
  const selectedRunbook = runbooks.find(rb => rb._id === selectedRunbookId) || runbooks[0];
  const filteredExecutions = executions.filter(e => e.runbookId === (selectedRunbook?._id || ''));

  // 1. 执行弹窗表单状态
  const [execForm, setExecForm] = useState({ incidentId: '', operator: '', priority: '中' });

  // 2. 打开执行弹窗时，重置表单
  useEffect(() => {
    if (openExecDialog && selectedRunbook) {
      setExecForm({ incidentId: '', operator: '', priority: '中' });
    }
  }, [openExecDialog, selectedRunbook]);

  // 3. 提交执行记录
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
    } catch (e) {
      setSnackbar({ open: true, message: '创建执行记录失败', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // 2. 打开详情弹窗
  const handleViewExecution = (exec) => {
    setSelectedExecution(exec);
    setOpenExecDetail(true);
  };

  // 3. 步骤勾选、备注、图片 PATCH
  const handleStepUpdate = async (stepIdx, patch) => {
    if (!selectedExecution) return;
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
  };

  useEffect(() => {
    if (editingRunbook) {
      reset({
        title: editingRunbook.title,
        description: editingRunbook.description,
        steps: editingRunbook.steps || []
      });
    } else {
      reset({ title: '', description: '', steps: [] });
    }
  }, [editingRunbook, openRunbookDialog, reset]);

  useEffect(() => {
    // 默认选中第一个Runbook
    if (runbooks.length && !selectedRunbookId) {
      setSelectedRunbookId(runbooks[0]._id);
    }
  }, [runbooks, selectedRunbookId]);

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

  const handleStepImageUpload = async (file, idx) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setValue(`steps.${idx}.image`, res.data.url);
      setSnackbar({ open: true, message: '图片上传成功', severity: 'success' });
    } catch (e) {
      setSnackbar({ open: true, message: '图片上传失败', severity: 'error' });
    }
  };

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

  return (
    <Box>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Runbook MVP</Typography>
        </Toolbar>
      </AppBar>
      <Container sx={{ mt: 4 }} maxWidth="xl">
        <Grid container spacing={2}>
          {/* 左侧菜单栏：Runbook卡片列表 */}
          <Grid item xs={12} md={4} lg={3}>
            <Button variant="contained" startIcon={<Add />} sx={{ mb: 2 }} fullWidth onClick={() => { setEditingRunbook(null); setOpenRunbookDialog(true); }}>新建Runbook</Button>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {runbooks.map(rb => (
                <Paper key={rb._id} elevation={selectedRunbookId === rb._id ? 6 : 1} sx={{ p: 2, border: selectedRunbookId === rb._id ? '2px solid #1976d2' : '1px solid #eee', cursor: 'pointer', transition: '0.2s' }} onClick={() => setSelectedRunbookId(rb._id)}>
                  <Typography variant="h6" noWrap>{rb.title}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{rb.description}</Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button size="small" variant="outlined" onClick={e => { e.stopPropagation(); setEditingRunbook(rb); setOpenRunbookDialog(true); }}>编辑</Button>
                    <Button size="small" variant="outlined" color="error" onClick={e => { e.stopPropagation(); handleDeleteRunbook(rb._id); }}>删除</Button>
                    <Button size="small" variant="outlined" onClick={e => { e.stopPropagation(); setSelectedRunbookId(rb._id); setOpenExecDialog(true); }}>执行</Button>
                    <Button size="small" variant="outlined" onClick={e => { e.stopPropagation(); setEditingRunbook(rb); setOpenRunbookDialog(true); }}>查看</Button>
                  </Box>
                </Paper>
              ))}
            </Box>
          </Grid>
          {/* 右侧：执行记录列表 */}
          <Grid item xs={12} md={8} lg={9}>
            <Typography variant="h6" sx={{ mb: 2 }}>执行记录（{selectedRunbook?.title || ''}）</Typography>
            <Paper>
              <List>
                {filteredExecutions.length === 0 && <ListItem><ListItemText primary="暂无执行记录" /></ListItem>}
                {filteredExecutions.map(exec => {
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
      <Dialog open={openRunbookDialog} onClose={() => setOpenRunbookDialog(false)} maxWidth="md" fullWidth>
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
      <Dialog open={openExecDialog} onClose={() => setOpenExecDialog(false)} maxWidth="xs" fullWidth>
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
      <Dialog open={openExecDetail && !!selectedExecution} onClose={() => setOpenExecDetail(false)} maxWidth="md" fullWidth>
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
                        <TextField size="small" label="备注" value={step.remarkText || ''} onChange={e => handleStepUpdate(idx, { remarkText: e.target.value })} sx={{ width: 200 }} />
                        <Button component="label" startIcon={<UploadFile />} size="small">
                          {step.remarkImage ? '更换图片' : '上传图片'}
                          <input type="file" hidden accept="image/*" onChange={async e => {
                            if (e.target.files?.[0]) {
                              const formData = new FormData();
                              formData.append('file', e.target.files[0]);
                              const res = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
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
    </Box>
  );
}

export default App; 