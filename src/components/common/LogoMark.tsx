import React from 'react';

interface LogoMarkProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'light' | 'dark' | 'white';
  showTagline?: boolean;
  layout?: 'horizontal' | 'vertical';
}

export const LogoMark: React.FC<LogoMarkProps> = ({
  size = 'md',
  variant = 'dark',
  showTagline = true,
  layout = 'horizontal'
}) => {
  const iconSizes = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16'
  };

  const textSizes = {
    sm: 'text-base',
    md: 'text-xl',
    lg: 'text-2xl',
    xl: 'text-3xl'
  };

  const taglineSizes = {
    sm: 'text-[10px]',
    md: 'text-xs',
    lg: 'text-sm',
    xl: 'text-base'
  };

  const isWhite = variant === 'white';
  const textColor = isWhite ? 'text-white' : 'text-emerald-500';
  const taglineColor = isWhite ? 'text-emerald-200' : 'text-emerald-400';

  return (
    <div className={`flex ${layout === 'vertical' ? 'flex-col items-center text-center gap-2' : 'items-center gap-3'} group cursor-pointer select-none`}>
      {/* Official Emblem: Green Bowl + Dual Vertical Sprouting Leaves */}
      <div className={`relative flex items-center justify-center ${iconSizes[size]} transition-transform duration-300 group-hover:scale-105 shrink-0`}>
        <svg viewBox="0 0 100 110" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
          {/* Back Leaf (Lighter/Vibrant Green) */}
          <path 
            d="M50 62 C38 42, 28 20, 48 5 C62 25, 58 48, 50 62 Z" 
            fill="#38C247" 
          />
          <path 
            d="M48 5 C34 30, 40 48, 50 62 C42 48, 38 30, 48 5 Z" 
            fill="#27A835" 
          />
          <path 
            d="M48 5 C47 25, 49 45, 50 62" 
            stroke="#FFFFFF" 
            strokeWidth="1.5" 
            strokeLinecap="round" 
            opacity="0.6" 
          />

          {/* Front Leaf (Darker Green overlapping right) */}
          <path 
            d="M46 72 C52 48, 64 22, 75 18 C82 38, 66 60, 46 72 Z" 
            fill="#1E932A" 
          />
          <path 
            d="M75 18 C62 38, 54 60, 46 72 C58 58, 70 38, 75 18 Z" 
            fill="#38C247" 
          />
          <path 
            d="M75 18 C62 38, 53 58, 46 72" 
            stroke="#FFFFFF" 
            strokeWidth="1.5" 
            strokeLinecap="round" 
            opacity="0.6" 
          />

          {/* Green Bowl Base */}
          <path 
            d="M22 48 C22 75, 78 75, 78 48 Z" 
            fill="#38C247" 
          />
          
          {/* Foot of Bowl */}
          <rect x="42" y="73" width="16" height="5" fill="#38C247" rx="1" />
        </svg>
      </div>

      {/* Brand Wordmark & Tagline */}
      <div className="flex flex-col">
        <span className={`font-black tracking-tight ${textColor} ${textSizes[size]} leading-none lowercase`}>
          protein bowl
        </span>
        {showTagline && (
          <span className={`font-medium ${taglineColor} ${taglineSizes[size]} tracking-wide mt-0.5`}>
            Striving for a healthier life
          </span>
        )}
      </div>
    </div>
  );
};

