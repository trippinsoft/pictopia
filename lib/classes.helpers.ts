import { extendTailwindMerge } from 'tailwind-merge';

export const extendedTwMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'body', 'caption', 'button'],
        },
      ],
    },
  },
});
