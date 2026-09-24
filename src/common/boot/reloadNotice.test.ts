// cs-blessed-boot

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installFakeStorage, type InstalledStorage } from '../web-storage/storage.fake'
import { consumeReloadForUpdate, rememberReloadForUpdate } from './reloadNotice'

/**
 * The note is read exactly once: the reload leaves it, the next page takes it,
 * and a second read — StrictMode's doubled effect — finds nothing.
 */
describe('reloadNotice', () => {
  let storage: InstalledStorage

  beforeAll(() => {
    storage = installFakeStorage()
  })

  beforeEach(() => {
    storage.clear()
  })

  it('is false when no reload left a note', () => {
    expect(consumeReloadForUpdate()).toBe(false)
  })

  it('is true once after a reload left one, then false', () => {
    rememberReloadForUpdate()
    expect(consumeReloadForUpdate()).toBe(true)
    expect(consumeReloadForUpdate()).toBe(false)
  })
})
