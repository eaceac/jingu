export function validNickname(value: string): boolean {
  return value.length >= 1 && value.length <= 24 && /^[\p{L}\p{M} '’-]+$/u.test(value) && /\p{L}/u.test(value);
}

export function validPatchName(value: string): boolean {
  return value.length >= 1 && value.length <= 40 && /^[\p{L}\p{M} '’!&-]+$/u.test(value) && /\p{L}/u.test(value);
}
