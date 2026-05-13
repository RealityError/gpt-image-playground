import { DEFAULT_PARAMS, type AppSettings, type TaskParams } from '../types'
import { normalizeImageSize } from './size'

export const DEFAULT_MAX_OUTPUT_IMAGES = 3

export function getOutputImageLimitForSettings(_settings: AppSettings, concurrencyLimit?: number) {
  return concurrencyLimit ?? DEFAULT_MAX_OUTPUT_IMAGES
}

export function normalizeParamsForSettings(
  params: TaskParams,
  _settings: AppSettings,
  _options: { hasInputImages?: boolean; concurrencyLimit?: number } = {},
): TaskParams {
  const outputImageLimit = _options.concurrencyLimit ?? DEFAULT_MAX_OUTPUT_IMAGES
  return {
    ...params,
    size: normalizeImageSize(params.size) || DEFAULT_PARAMS.size,
    n: Math.min(outputImageLimit, Math.max(1, params.n || DEFAULT_PARAMS.n)),
  }
}

export function getChangedParams(current: TaskParams, next: TaskParams): Partial<TaskParams> {
  const patch: Partial<TaskParams> = {}
  for (const key of Object.keys(next) as Array<keyof TaskParams>) {
    if (current[key] !== next[key]) {
      ;(patch as Record<keyof TaskParams, TaskParams[keyof TaskParams]>)[key] = next[key]
    }
  }
  return patch
}
