import { clsx, type ClassValue } from 'clsx';
import { extendedTwMerge } from './classes.helpers';

export function cn(...inputs: ClassValue[]) {
  return extendedTwMerge(clsx(inputs));
}
