// 精简版 apiProfiles 兼容层
//
// 原项目把多个第三方 API provider（OpenAI/fal.ai/自定义）的配置放在客户端，
// 让用户在浏览器里填 API key 直接调第三方。本项目的后端已经做了代理，
// 前端只需要通过 /web/* 调用后端。这里保留空的 profile 形状是为了让
// 沿用原项目结构的 InputBar/SettingsModal 等组件不用改太多，
// 但所有 provider 相关的字段都是固定值。

import type { AppSettings } from '../types'

export type ApiMode = 'images' | 'responses'
export type BuiltInApiProvider = 'openai' | 'fal'
export type ApiProvider = BuiltInApiProvider | string

export interface ApiProfile {
  id: string
  name: string
  provider: ApiProvider
  baseUrl: string
  apiKey: string
  model: string
  timeout: number
  apiMode: ApiMode
  codexCli: boolean
  apiProxy: boolean
  responseFormatB64Json?: boolean
}

export const BUILTIN_PROFILE: ApiProfile = {
  id: 'builtin',
  name: '内置服务',
  provider: 'openai',
  baseUrl: '',
  apiKey: '',
  model: 'gpt-image-2',
  timeout: 600,
  apiMode: 'images',
  codexCli: false,
  apiProxy: false,
  responseFormatB64Json: false,
}

export function getActiveApiProfile(_settings: AppSettings): ApiProfile {
  return BUILTIN_PROFILE
}

export function normalizeSettings(settings: AppSettings): AppSettings {
  return { ...settings }
}
