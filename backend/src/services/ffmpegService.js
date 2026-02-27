import { spawn } from 'node:child_process';

function runCommand(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (buf) => {
      stdout += buf.toString();
    });
    child.stderr.on('data', (buf) => {
      stderr += buf.toString();
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${bin} failed: ${stderr}`));
      }
    });
  });
}

export async function detectSubtitleStreams(inputPath) {
  const args = [
    '-v', 'error',
    '-select_streams', 's',
    '-show_entries', 'stream=index,codec_name:stream_tags=language',
    '-of', 'json',
    inputPath
  ];
  const { stdout } = await runCommand('ffprobe', args);
  const parsed = JSON.parse(stdout || '{}');
  return (parsed.streams || []).map((stream) => ({
    index: stream.index,
    codec: stream.codec_name,
    language: stream.tags?.language || 'und'
  }));
}

export async function extractSubtitle(inputPath, subtitleIndex, outputPath) {
  const args = ['-y', '-i', inputPath, '-map', `0:s:${subtitleIndex}`, outputPath];
  await runCommand('ffmpeg', args);
}
