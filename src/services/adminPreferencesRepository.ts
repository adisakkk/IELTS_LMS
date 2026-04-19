import { createDefaultConfig } from '../constants/examDefaults';
import type { ExamConfig } from '../types';
import {
  backendGet,
  backendPut,
  isBackendBuilderEnabled,
  isBackendNotFound,
} from './backendBridge';

const STORAGE_KEY_DEFAULTS = 'ielts_defaults';
let defaultsRevision: number | undefined;

class AdminPreferencesRepository {
  getDefaults(): ExamConfig {
    const saved = localStorage.getItem(STORAGE_KEY_DEFAULTS);
    return saved
      ? (JSON.parse(saved) as ExamConfig)
      : createDefaultConfig('Academic', 'Academic');
  }

  async loadDefaults(): Promise<ExamConfig> {
    if (!isBackendBuilderEnabled()) {
      return this.getDefaults();
    }

    try {
      const payload = await backendGet<{
        configSnapshot: ExamConfig;
        revision?: number | undefined;
      }>('/v1/settings/exam-defaults');
      defaultsRevision = payload.revision;
      this.persistDefaults(payload.configSnapshot);
      return payload.configSnapshot;
    } catch (error) {
      if (!isBackendNotFound(error)) {
        throw error;
      }

      return this.getDefaults();
    }
  }

  private persistDefaults(config: ExamConfig) {
    localStorage.setItem(STORAGE_KEY_DEFAULTS, JSON.stringify(config));
  }

  async saveDefaults(config: ExamConfig) {
    if (!isBackendBuilderEnabled()) {
      this.persistDefaults(config);
      return;
    }

    try {
      const payload = await backendPut<{
        configSnapshot: ExamConfig;
        revision?: number | undefined;
      }>('/v1/settings/exam-defaults', {
        configSnapshot: config,
        revision: defaultsRevision ?? 0,
      });
      defaultsRevision = payload.revision;
      this.persistDefaults(payload.configSnapshot);
    } catch (error) {
      if (!isBackendNotFound(error)) {
        throw error;
      }

      this.persistDefaults(config);
    }
  }
}

export const adminPreferencesRepository = new AdminPreferencesRepository();
