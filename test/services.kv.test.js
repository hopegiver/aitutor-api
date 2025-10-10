/**
 * KV Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KVService } from '../src/services/kv.js';

describe('KVService', () => {
  let kvService;
  let mockKV;

  beforeEach(() => {
    // Mock KV namespace
    mockKV = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      list: vi.fn()
    };

    kvService = new KVService(mockKV);
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with KV namespace', () => {
      expect(kvService.kv).toBe(mockKV);
    });
  });

  describe('getJob', () => {
    it('should return parsed job data when job exists', async () => {
      const jobData = { id: 'job-123', status: 'pending' };
      mockKV.get.mockResolvedValue(JSON.stringify(jobData));

      const result = await kvService.getJob('job-123');

      expect(mockKV.get).toHaveBeenCalledWith('job:job-123');
      expect(result).toEqual(jobData);
    });

    it('should return null when job does not exist', async () => {
      mockKV.get.mockResolvedValue(null);

      const result = await kvService.getJob('non-existent');

      expect(mockKV.get).toHaveBeenCalledWith('job:non-existent');
      expect(result).toBeNull();
    });

    it('should handle JSON parsing errors gracefully', async () => {
      mockKV.get.mockResolvedValue('invalid json');

      await expect(kvService.getJob('job-123')).rejects.toThrow();
    });
  });

  describe('saveJob', () => {
    it('should stringify and save job data', async () => {
      const jobData = { id: 'job-123', status: 'pending' };
      mockKV.put.mockResolvedValue();

      await kvService.saveJob('job-123', jobData);

      expect(mockKV.put).toHaveBeenCalledWith('job:job-123', JSON.stringify(jobData));
    });
  });

  describe('updateJobStatus', () => {
    it('should update job status with additional fields', async () => {
      const existingJob = { id: 'job-123', status: 'pending', createdAt: '2023-01-01' };
      const updates = { processedBy: 'worker-1' };

      mockKV.get.mockResolvedValue(JSON.stringify(existingJob));
      mockKV.put.mockResolvedValue();

      const result = await kvService.updateJobStatus('job-123', 'processing', updates);

      expect(result.status).toBe('processing');
      expect(result.processedBy).toBe('worker-1');
      expect(result.updatedAt).toBeTruthy();
      expect(result.id).toBe('job-123');
      expect(result.createdAt).toBe('2023-01-01');
    });

    it('should throw error when job not found', async () => {
      mockKV.get.mockResolvedValue(null);

      await expect(kvService.updateJobStatus('non-existent', 'processing'))
        .rejects.toThrow('Job non-existent not found');
    });
  });

  describe('updateJobProgress', () => {
    it('should update job progress information', async () => {
      const existingJob = { id: 'job-123', status: 'processing' };

      mockKV.get.mockResolvedValue(JSON.stringify(existingJob));
      mockKV.put.mockResolvedValue();

      const result = await kvService.updateJobProgress('job-123', 'uploading', 50, 'Uploading video');

      expect(result.progress).toEqual({
        stage: 'uploading',
        percentage: 50,
        message: 'Uploading video'
      });
      expect(result.updatedAt).toBeTruthy();
    });

    it('should throw error when job not found', async () => {
      mockKV.get.mockResolvedValue(null);

      await expect(kvService.updateJobProgress('non-existent', 'uploading', 50, 'message'))
        .rejects.toThrow('Job non-existent not found');
    });
  });

  describe('setJobResult', () => {
    it('should set job result and mark as completed', async () => {
      const existingJob = {
        id: 'job-123',
        status: 'processing',
        metadata: { duration: 120 }
      };
      const result = { transcription: 'Hello world', format: 'srt' };
      const newMetadata = { language: 'en' };

      mockKV.get.mockResolvedValue(JSON.stringify(existingJob));
      mockKV.put.mockResolvedValue();

      const updatedJob = await kvService.setJobResult('job-123', result, newMetadata);

      expect(updatedJob.status).toBe('completed');
      expect(updatedJob.result).toEqual(result);
      expect(updatedJob.metadata).toEqual({
        duration: 120,
        language: 'en'
      });
      expect(updatedJob.completedAt).toBeTruthy();
      expect(updatedJob.progress.stage).toBe('completed');
      expect(updatedJob.progress.percentage).toBe(100);
    });

    it('should throw error when job not found', async () => {
      mockKV.get.mockResolvedValue(null);

      await expect(kvService.setJobResult('non-existent', { result: 'data' }))
        .rejects.toThrow('Job non-existent not found');
    });
  });

  describe('setJobError', () => {
    it('should set job error and mark as failed', async () => {
      const existingJob = { id: 'job-123', status: 'processing' };
      const error = new Error('Processing failed');

      mockKV.get.mockResolvedValue(JSON.stringify(existingJob));
      mockKV.put.mockResolvedValue();

      const updatedJob = await kvService.setJobError('job-123', error);

      expect(updatedJob.status).toBe('failed');
      expect(updatedJob.error.message).toBe('Processing failed');
      expect(updatedJob.error.timestamp).toBeTruthy();
      expect(updatedJob.progress.stage).toBe('failed');
      expect(updatedJob.progress.percentage).toBe(0);
      expect(updatedJob.progress.message).toContain('Error: Processing failed');
    });

    it('should handle error without message', async () => {
      const existingJob = { id: 'job-123', status: 'processing' };
      const error = {};

      mockKV.get.mockResolvedValue(JSON.stringify(existingJob));
      mockKV.put.mockResolvedValue();

      const updatedJob = await kvService.setJobError('job-123', error);

      expect(updatedJob.error.message).toBe('Unknown error');
      expect(updatedJob.progress.message).toContain('Error: Unknown error');
    });

    it('should throw error when job not found', async () => {
      mockKV.get.mockResolvedValue(null);

      await expect(kvService.setJobError('non-existent', new Error('test')))
        .rejects.toThrow('Job non-existent not found');
    });
  });

  describe('deleteJob', () => {
    it('should delete job from KV store', async () => {
      mockKV.delete.mockResolvedValue();

      await kvService.deleteJob('job-123');

      expect(mockKV.delete).toHaveBeenCalledWith('job:job-123');
    });
  });

  describe('listJobs', () => {
    it('should return list of jobs with basic info', async () => {
      const keys = [
        { name: 'job:job-1' },
        { name: 'job:job-2' }
      ];

      const job1 = {
        id: 'job-1',
        status: 'completed',
        createdAt: '2023-01-01',
        updatedAt: '2023-01-02'
      };

      const job2 = {
        id: 'job-2',
        status: 'pending',
        createdAt: '2023-01-03',
        updatedAt: '2023-01-03'
      };

      mockKV.list.mockResolvedValue({ keys });
      mockKV.get
        .mockResolvedValueOnce(JSON.stringify(job1))
        .mockResolvedValueOnce(JSON.stringify(job2));

      const result = await kvService.listJobs();

      expect(mockKV.list).toHaveBeenCalledWith({ prefix: 'job:', limit: 100 });
      expect(result).toEqual([
        {
          id: 'job-1',
          status: 'completed',
          createdAt: '2023-01-01',
          updatedAt: '2023-01-02'
        },
        {
          id: 'job-2',
          status: 'pending',
          createdAt: '2023-01-03',
          updatedAt: '2023-01-03'
        }
      ]);
    });

    it('should use custom limit parameter', async () => {
      mockKV.list.mockResolvedValue({ keys: [] });

      await kvService.listJobs(50);

      expect(mockKV.list).toHaveBeenCalledWith({ prefix: 'job:', limit: 50 });
    });

    it('should skip jobs that cannot be retrieved', async () => {
      const keys = [
        { name: 'job:job-1' },
        { name: 'job:job-2' }
      ];

      const job1 = {
        id: 'job-1',
        status: 'completed',
        createdAt: '2023-01-01',
        updatedAt: '2023-01-02'
      };

      mockKV.list.mockResolvedValue({ keys });
      mockKV.get
        .mockResolvedValueOnce(JSON.stringify(job1))
        .mockResolvedValueOnce(null); // job-2 not found

      const result = await kvService.listJobs();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('job-1');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete job lifecycle', async () => {
      const jobId = 'test-job';
      const initialJob = { id: jobId, status: 'pending', createdAt: '2023-01-01' };

      // Create job
      mockKV.put.mockResolvedValue();
      await kvService.saveJob(jobId, initialJob);

      // Update status
      mockKV.get.mockResolvedValue(JSON.stringify(initialJob));
      mockKV.put.mockResolvedValue();
      await kvService.updateJobStatus(jobId, 'processing');

      // Update progress
      const processingJob = { ...initialJob, status: 'processing', updatedAt: '2023-01-02' };
      mockKV.get.mockResolvedValue(JSON.stringify(processingJob));
      await kvService.updateJobProgress(jobId, 'transcribing', 75, 'Processing audio');

      // Set result
      const progressJob = {
        ...processingJob,
        progress: { stage: 'transcribing', percentage: 75, message: 'Processing audio' },
        updatedAt: '2023-01-03'
      };
      mockKV.get.mockResolvedValue(JSON.stringify(progressJob));
      const finalJob = await kvService.setJobResult(jobId, { text: 'transcription' });

      expect(finalJob.status).toBe('completed');
      expect(finalJob.result.text).toBe('transcription');
      expect(finalJob.progress.percentage).toBe(100);
    });
  });
});