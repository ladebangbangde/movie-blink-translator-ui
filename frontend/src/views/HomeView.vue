<script setup>
import { ref, computed, onBeforeUnmount } from 'vue';
import { ElMessage } from 'element-plus';
import { uploadMovie, detectSubtitles, createJob, queryJob, getDownloadUrl } from '../api/client';

const file = ref(null);
const fileId = ref('');
const streams = ref([]);
const subtitleIndex = ref(null);
const mode = ref('both');
const source = ref('embedded');
const uploadProgress = ref(0);
const outputVideo = ref(false);
const tasks = ref([]);

const canCreateJob = computed(() => fileId.value && (source.value === 'ocr' || subtitleIndex.value !== null));

const statusLabelMap = {
  idle: '未开始',
  pending: '排队中',
  waiting: '等待中',
  active: '处理中',
  completed: '已完成',
  failed: '失败'
};

function formatTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function createTaskCard({ jobId, fileName, createdAt }) {
  return {
    jobId: String(jobId),
    fileName: fileName || file.value?.name || 'unknown',
    createdAt: createdAt || Date.now(),
    status: 'pending',
    progress: 0,
    failedReason: '',
    failedStack: '',
    outputPath: '',
    outputVideoPath: '',
    logs: []
  };
}

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
      mode: mode.value,
      source: source.value,
      outputVideo: outputVideo.value,
      fileName: file.value?.name || ''
    });

    const task = createTaskCard(result);
    tasks.value.unshift(task);
    ElMessage.success(`任务 ${task.jobId} 已创建`);
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '任务创建失败');
  }
}

let polling = null;

async function pollAllJobs() {
  const runningTasks = tasks.value.filter((t) => !['completed', 'failed'].includes(t.status));
  await Promise.all(runningTasks.map(async (task) => {
    try {
      const result = await queryJob(task.jobId);
      task.status = result.status;
      task.progress = result.progress ?? 0;
      task.failedReason = result.failedReason || '';
      task.failedStack = result.failedStack || '';
      task.outputPath = result.outputPath || '';
      task.outputVideoPath = result.outputVideoPath || '';
      task.fileName = result.fileName || task.fileName;
      task.createdAt = result.createdAt || task.createdAt;
      task.logs = Array.isArray(result.logs) ? result.logs : [];
    } catch (error) {
      task.failedReason = error.response?.data?.message || '任务状态查询失败';
    }
  }));
}

polling = setInterval(pollAllJobs, 1500);
onBeforeUnmount(() => {
  if (polling) clearInterval(polling);
});
</script>

<template>
  <div style="max-width: 980px; margin: 40px auto">
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

      <el-radio-group v-model="source" style="margin: 8px 0 12px 0">
        <el-radio-button label="embedded">内封字幕轨</el-radio-button>
        <el-radio-button label="ocr">画面硬字幕 OCR（实验）</el-radio-button>
      </el-radio-group>

      <el-button :disabled="!fileId || source === 'ocr'" @click="onDetect">检测字幕轨</el-button>
      <el-select v-model="subtitleIndex" :disabled="source === 'ocr'" placeholder="选择字幕轨" style="width: 100%; margin-top: 12px">
        <el-option
          v-for="s in streams"
          :key="s.index"
          :label="`#${s.index} - ${s.codec} (${s.language})`"
          :value="s.index"
        />
      </el-select>
      <div v-if="source === 'ocr'" style="margin-top: 8px; color: #909399">OCR 模式不需要选择字幕轨，将从画面底部识别文本。</div>

      <el-radio-group v-model="mode" style="margin: 16px 0">
        <el-radio-button label="zh">仅中文</el-radio-button>
        <el-radio-button label="en">仅英文</el-radio-button>
        <el-radio-button label="both">双语</el-radio-button>
      </el-radio-group>

      <el-checkbox v-model="outputVideo" style="margin: 0 0 12px 0">
        生成可直接播放的新视频（移除原字幕轨并挂载新字幕）
      </el-checkbox>

      <el-button type="success" :disabled="!canCreateJob" @click="onCreateJob">创建任务</el-button>
    </el-card>

    <el-card style="margin-top: 16px">
      <template #header>任务列表（按文件名 + 时间戳独立）</template>
      <el-empty v-if="tasks.length === 0" description="暂无任务" />
      <div v-for="task in tasks" :key="task.jobId" style="border: 1px solid #ebeef5; border-radius: 8px; padding: 12px; margin-bottom: 12px">
        <div><b>文件：</b>{{ task.fileName }}</div>
        <div><b>创建时间：</b>{{ formatTime(task.createdAt) }}</div>
        <div><b>任务ID：</b>{{ task.jobId }}</div>
        <div><b>状态：</b>{{ statusLabelMap[task.status] || task.status }}</div>
        <el-progress :percentage="task.progress" style="margin: 8px 0" />
        <div v-if="task.outputPath"><b>字幕输出：</b>{{ task.outputPath }}</div>
        <div v-if="task.outputVideoPath"><b>视频输出：</b>{{ task.outputVideoPath }}</div>
        <div v-if="task.failedReason" style="margin-top: 8px; color: #f56c6c"><b>失败原因：</b>{{ task.failedReason }}</div>
        <div v-if="task.logs && task.logs.length" style="margin-top: 8px">
          <b>任务日志：</b>
          <el-input
            type="textarea"
            :rows="6"
            :model-value="task.logs.join('\n')"
            readonly
            style="margin-top: 6px"
          />
        </div>
        <el-input
          v-if="task.failedStack"
          type="textarea"
          :rows="4"
          :model-value="task.failedStack"
          readonly
          style="margin-top: 8px"
        />
        <el-link v-if="task.status === 'completed'" :href="getDownloadUrl(task.jobId)" target="_blank" style="margin-top: 8px">
          下载输出文件
        </el-link>
      </div>
    </el-card>
  </div>
</template>
