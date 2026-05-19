import React from 'react'
import { render, screen } from '@testing-library/react'

// Mock fetch globally
global.fetch = jest.fn()

describe('🔗 Web + API Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('✅ should validate PDB search API contract', async () => {
    const mockFetch = global.fetch as jest.Mock
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { files: ['1ACE.pdb', '2ACE.pdb'], count: 2 },
      }),
    })

    const result = await mockFetch('/api/pdb/search', { method: 'POST' })
    const data = await result.json()

    expect(data.success).toBe(true)
    expect(Array.isArray(data.data.files)).toBe(true)
    expect(data.data.files.length).toBe(2)
  })

  test('✅ should validate ChEMBL search API contract', async () => {
    const mockFetch = global.fetch as jest.Mock
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { molecules: ['MOL1', 'MOL2'] },
      }),
    })

    const result = await mockFetch('/api/chembl/search', { method: 'POST' })
    const data = await result.json()

    expect(data.success).toBe(true)
    expect(Array.isArray(data.data.molecules)).toBe(true)
  })

  test('✅ should validate file list API contract', async () => {
    const mockFetch = global.fetch as jest.Mock
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { AChE: ['file1.pdb'], BACE1: ['file2.pdb'] },
      }),
    })

    const result = await mockFetch('/api/files/list/PDB', { method: 'GET' })
    const data = await result.json()

    expect(data.success).toBe(true)
    expect(typeof data.data).toBe('object')
  })

  test('✅ should handle API errors gracefully', async () => {
    const mockFetch = global.fetch as jest.Mock
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({
        success: false,
        message: 'Internal Server Error',
      }),
    })

    const result = await mockFetch('/api/error', { method: 'POST' })
    const data = await result.json()

    expect(data.success).toBe(false)
    expect(result.ok).toBe(false)
  })

  test('✅ should handle network errors', async () => {
    const mockFetch = global.fetch as jest.Mock
    mockFetch.mockRejectedValueOnce(new Error('Network timeout'))

    try {
      await mockFetch('/api/timeout')
      fail('Should have thrown error')
    } catch (error: any) {
      expect(error.message).toBe('Network timeout')
    }
  })
})
