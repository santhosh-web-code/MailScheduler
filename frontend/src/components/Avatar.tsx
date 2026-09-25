import React, { useState } from 'react';
import { cn } from '../lib/utils';

export interface AvatarProps {
  src?: string | null;
  name?: string | null;
  email?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  onClick?: () => void;
}

const sizeClasses = {
  sm: 'w-7 h-7 text-[11px]',
  md: 'w-9 h-9 text-xs',
  lg: 'w-11 h-11 text-sm',
  xl: 'w-14 h-14 text-base',
};

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  email,
  size = 'md',
  className,
  onClick,
}) => {
  const [imageError, setImageError] = useState(false);

  const getInitials = (userName?: string | null, userEmail?: string | null): string => {
    if (userName && userName.trim()) {
      const parts = userName.trim().split(/\s+/);
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      }
      return userName.slice(0, 2).toUpperCase();
    }
    if (userEmail && userEmail.trim()) {
      return userEmail.slice(0, 2).toUpperCase();
    }
    return 'U';
  };

  const initials = getInitials(name, email);

  const containerClasses = cn(
    'relative inline-flex items-center justify-center rounded-full shrink-0 font-semibold select-none transition-all',
    sizeClasses[size],
    onClick && 'cursor-pointer hover:opacity-90 active:scale-95',
    className
  );

  if (src && !imageError) {
    return (
      <div className={containerClasses} onClick={onClick}>
        <img
          src={src}
          alt={name || email || 'Avatar'}
          onError={() => setImageError(true)}
          className="w-full h-full rounded-full object-cover border border-slate-200 shadow-sm"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        containerClasses,
        'bg-emerald-100 text-emerald-800 border border-emerald-300/70 shadow-sm'
      )}
      onClick={onClick}
    >
      {initials}
    </div>
  );
};

export default Avatar;
