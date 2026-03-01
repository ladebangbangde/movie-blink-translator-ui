<script setup>
import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { uploadMovie, detectSubtitles, createJob, queryJob, getDownloadUrl } from '../api/client';

const file = ref(null);
const fileId = ref('');
const streams = ref([]);
const subtitleIndex = ref(null);
const mode = ref('both');
const uploadProgress = ref(0);
const jobId = ref('');
const jobStatus = ref('idle');
const progress = ref(0);
const failedReason = ref('');
const outputPath = ref('');

const canCreateJob = computed(() => fileId.value && subtitleIndex.value !== null);

async function onSelectUpload(uploadFile) {
  try {
    file.value = uploadFile.raw;
    const result = await uploadMovie(file.value, (event) => {
      uploadProgress.value = Math.round((event.loaded / event.total) * 100);
    });
    fileId.value = result.fileId;
    ElMessage.success('上传成功');
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '上传失败');
  }
}

async function onDetect() {
  try {
    const result = await detectSubtitles(fileId.value);
    streams.value = result.streams;
    ElMessage.success('字幕轨检测完成');
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '检测失败');
  }
}

async function onCreateJob() {
  try {
    const result = await createJob({
      fileId: fileId.value,
      subtitleIndex: subtitleIndex.value,
      mode: mode.value
    });
    jobId.value = String(result.jobId);
    jobStatus.value = 'pending';
    failedReason.value = '';
    outputPath.value = '';
    pollJob();
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '任务创建失败');
  }
}

const statusLabelMap = {
  idle: '未开始',
  pending: '排队中',
  waiting: '等待中',
  active: '处理中',
  completed: '已完成',
  failed: '失败'
};

async function pollJob() {
  if (!jobId.value) return;
  const timer = setInterval(async () => {
    const result = await queryJob(jobId.value);
    jobStatus.value = result.status;
    progress.value = result.progress;
    failedReason.value = result.failedReason || '';
    outputPath.value = result.outputPath || '';
    if (['completed', 'failed'].includes(result.status)) {
      if (result.status === 'completed') {
        ElMessage.success('字幕处理完成，可点击下载');
      }
      if (result.status === 'failed') {
        ElMessage.error(result.failedReason || '字幕处理失败');
      }
      clearInterval(timer);
    }
  }, 1500);
}
</script>

<template>
  <div style="max-width: 820px; margin: 40px auto">
    <el-card>
      <template #header>Movie Blink Translator MVP</template>
      <el-steps :active="3" finish-status="success" style="margin-bottom: 24px">
        <el-step title="上传视频" />
        <el-step title="检测字幕轨" />
        <el-step title="生成字幕" />
      </el-steps>

      <el-upload :auto-upload="false" :show-file-list="false" :on-change="onSelectUpload">
        <el-button type="primary">选择 MKV/MP4</el-button>
      </el-upload>
      <el-progress :percentage="uploadProgress" style="margin-top: 12px" />

      <el-divider />

      <el-button :disabled="!fileId" @click="onDetect">检测字幕轨</el-button>
      <el-select v-model="subtitleIndex" placeholder="选择字幕轨" style="width: 100%; margin-top: 12px">
        <el-option
          v-for="s in streams"
          :key="s.index"
          :label="`#${s.index} - ${s.codec} (${s.language})`"
          :value="s.index"
        />
      </el-select>

      <el-radio-group v-model="mode" style="margin: 16px 0">
        <el-radio-button label="zh">仅中文</el-radio-button>
        <el-radio-button label="en">仅英文</el-radio-button>
        <el-radio-button label="both">双语</el-radio-button>
      </el-radio-group>

      <el-button type="success" :disabled="!canCreateJob" @click="onCreateJob">创建任务</el-button>

      <el-progress :percentage="progress" style="margin-top: 12px" />
      <div style="margin-top: 8px">任务ID：{{ jobId || '—' }}</div>
      <div style="margin-top: 8px">任务状态：{{ statusLabelMap[jobStatus] || jobStatus }}</div>
      <div v-if="outputPath" style="margin-top: 8px">服务端输出位置：{{ outputPath }}</div>
      <div v-if="failedReason" style="margin-top: 8px; color: #f56c6c">失败原因：{{ failedReason }}</div>
      <el-link v-if="jobStatus === 'completed'" :href="getDownloadUrl(jobId)" target="_blank">
        下载字幕文件
      </el-link>
      <div v-if="jobStatus === 'completed'" style="margin-top: 8px">
        下载链接：{{ getDownloadUrl(jobId) }}
      </div>
    </el-card>
  </div>
</template>
