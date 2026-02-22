import axios from 'axios';

export const api = axios.create({
  baseURL: '/api'
});

export async function uploadMovie(file, onUploadProgress) {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post('/upload', formData, { onUploadProgress });
  return data;
}

export async function detectSubtitles(fileId) {
  const { data } = await api.post('/detect-subtitles', { fileId });
  return data;
}

export async function createJob(payload) {
  const { data } = await api.post('/jobs', payload);
  return data;
}

export async function queryJob(jobId) {
  const { data } = await api.get(`/jobs/${jobId}`);
  return data;
}

export function getDownloadUrl(jobId) {
  return `/api/download/${jobId}`;
}
