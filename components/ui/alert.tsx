import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { View, type ViewProps } from 'react-native';
import { cn } from '@/lib/utils';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theming/ThemeProvider';
import LucideIcon, { IconName } from '@/lib/icons/LucideIcon';

const alertVariants = cva(
  'relative bg-background w-full rounded-lg border border-border p-4 shadow shadow-foreground/10',
  {
    variants: {
      variant: {
        default: '',
        destructive: 'border-destructive',
        success: 'border-success',
        warning: 'border-warning',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

function Alert({
  className,
  variant,
  children,
  icon,
  iconSize = 16,
  iconClassName,
  ...props
}: ViewProps &
  VariantProps<typeof alertVariants> & {
    ref?: React.RefObject<View>;
    icon: IconName;
    iconSize?: number;
    iconClassName?: string;
  }) {
  const { theme } = useTheme();

  const getIconColor = () => {
    switch (variant) {
      case 'destructive':
        return theme.colors.destructive;
      case 'success':
        return theme.colors.success;
      case 'warning':
        return theme.colors.warning;
      default:
        return theme.colors.foreground;
    }
  };

  const getIconClassName = () => {
    switch (variant) {
      case 'destructive':
        return 'text-destructive-foreground';
      case 'success':
        return 'text-success-foreground';
      case 'warning':
        return 'text-warning-foreground';
      default:
        return 'text-foreground';
    }
  };

  return (
    <View role="alert" className={alertVariants({ variant, className })} {...props}>
      <View className="absolute left-3.5 top-4 -translate-y-0.5">
        <LucideIcon
          name={icon}
          size={iconSize}
          color={getIconColor()}
          className={cn(iconClassName, getIconClassName())}
        />
      </View>
      {children}
    </View>
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<typeof Text>) {
  return (
    <Text
      className={cn('text-body mb-1 pl-7 leading-none tracking-tight text-foreground', className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<typeof Text>) {
  return (
    <Text className={cn('pl-7 text-sm leading-relaxed text-foreground', className)} {...props} />
  );
}

export { Alert, AlertDescription, AlertTitle };
