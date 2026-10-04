import { wordCloud } from './nounCloud.js'

self.onmessage = async ({ data }) => {
  try {
    self.postMessage({ state: 'ready', words: await wordCloud(data) })
  } catch {
    self.postMessage({ state: 'error', words: [] })
  }
}
