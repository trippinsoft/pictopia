import React from 'react';
import * as icons from 'lucide-react-native/icons';
import type { LucideProps } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { memo, useMemo } from 'react';

export type IconName = keyof typeof icons;
type IconProps = LucideProps & { name: IconName; className?: string };

const Icon: React.FC<IconProps> = memo(({ name, className, ...rest }) => {
  const CustomIcon = useMemo(() => {
    const Icon = icons[name] ?? icons.Image;
    Icon.displayName = name;

    return cssInterop(Icon, {
      className: {
        target: 'style',
        nativeStyleToProp: {
          color: true,
          opacity: true,
          width: true,
          height: true,
        },
      },
    });
  }, [name]);

  return <CustomIcon className={className} {...rest} />;
});

export default Icon;
