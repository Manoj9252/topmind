import { supabase, supabaseUrl, supabaseKey, configured } from './supabase'
import { isDemoActive } from './mockData'
import { putDemoFile, getDemoFile } from './demoFiles'

export const MATERIAL_TYPES: Record<string, string> = {
  'application/pdf': 'PDF', 'application/msword': 'Word', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/vnd.ms-powerpoint': 'PowerPoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
  'application/vnd.ms-excel': 'Excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel', 'text/plain': 'Text',
  'image/jpeg': 'Image', 'image/png': 'Image', 'image/gif': 'Image', 'image/webp': 'Image',
  'audio/mpeg': 'Audio', 'audio/mp4': 'Audio', 'audio/wav': 'Audio', 'audio/ogg': 'Audio',
  'video/mp4': 'Video', 'video/webm': 'Video', 'video/quicktime': 'Video',
}
export const MATERIAL_MAX_BYTES = 50 * 1024 * 1024
export const EVIDENCE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024

export const safeName = (name: string) => name.replace(/[^\w.-]+/g, '_').slice(-120)

export function checkFile(file: File, types: string[], maxBytes: number): string | null {
  if (!types.includes(file.type)) return 'This file type is not allowed.'
  if (file.size > maxBytes) return `The file is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`
  return null
}

// Uploads to a private bucket with progress reporting (supabase-js has no
// progress callback, so this calls the Storage API directly with the user's session).
export async function uploadWithProgress(bucket: string, path: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  if (!configured || isDemoActive()) {
    await putDemoFile(bucket, path, file)
    onProgress(100)
    return
  }
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Please sign in again.')
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${supabaseUrl}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('apikey', supabaseKey)
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100))
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve()
      let msg = 'Upload failed.'
      try { msg = JSON.parse(xhr.responseText).message ?? msg } catch { /* keep default */ }
      reject(new Error(/row-level security|Unauthorized/i.test(msg) ? 'You do not have permission to upload here.' : msg))
    }
    xhr.onerror = () => reject(new Error('Upload failed. Please check your connection.'))
    xhr.send(file)
  })
}

// Short-lived link to a private file (never a public URL).
export async function openPrivateFile(bucket: string, path: string, download?: string) {
  if (!configured || isDemoActive()) {
    const file = await getDemoFile(bucket, path)
    if (!file) throw new Error('This is a sample material with no file attached. Upload a real file to preview or download it.')
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.rel = 'noopener'
    if (download) a.download = download
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
    return
  }
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 120, download ? { download } : undefined)
  if (error || !data) throw new Error('You do not have access to this file, or it was removed.')
  window.open(data.signedUrl, '_blank', 'noopener')
}
