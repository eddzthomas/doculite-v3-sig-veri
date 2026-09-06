import { describe, expect, it } from 'vitest'
import Home from '../src/app/page'

describe('web app scaffold', () => {
  it('default page module exports a component', () => {
    expect(Home).toBeTypeOf('function')
  })
})
