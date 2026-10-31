import { z } from 'zod'
import { fullNameSchema, idSchema, paginationSchema, pinSchema, slugSchema } from '@/lib/validation/common'

export const parentPhoneSchema = z.string().trim().min(1, 'Enter a phone number.').max(40)
  .regex(/^[+\d\s()-]+$/, 'Enter a valid phone number.')
  .transform(value => {
    const compact = value.replace(/[\s()-]/g, '')
    if (/^0\d{10}$/.test(compact)) return `+234${compact.slice(1)}`
    if (/^234\d{10}$/.test(compact)) return `+${compact}`
    return compact
  })
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, 'Use a Nigerian phone number or include the country code, e.g. +2348012345678.'))

export const parentLoginSchema = z.object({ schoolSlug: slugSchema, phone: parentPhoneSchema, pin: pinSchema }).strict()
export const parentListSchema = paginationSchema.extend({ search: z.string().trim().max(100).optional() }).strict()
export const createParentSchema = z.object({ fullName: fullNameSchema, phone: parentPhoneSchema, pin: pinSchema, studentId: idSchema }).strict()
export const updateParentSchema = z.object({ parentId: idSchema, fullName: fullNameSchema.optional(), phone: parentPhoneSchema.optional(), pin: pinSchema.optional(), isActive: z.boolean().optional() })
  .strict().refine(value => Object.keys(value).length > 1, { message: 'Choose a detail to update.' })
export const parentLinkSchema = z.object({ parentId: idSchema, studentId: idSchema, isActive: z.boolean() }).strict()
export const commentQuerySchema = paginationSchema.extend({ parentStudentId: idSchema }).strict()
export const commentSchema = z.object({ parentStudentId: idSchema, body: z.string().trim().min(1, 'Write a comment.').max(2000, 'Comments can be up to 2,000 characters.') }).strict()
export const parentChildrenQuerySchema = z.object({ studentId: idSchema }).strict()
export const teacherFamiliesSchema = parentListSchema.extend({ classArmId: idSchema.optional() }).strict()
