import React from 'react';

interface EllipsisProps {
  orientation?: 'horizontal' | 'vertical';
  style?: React.CSSProperties;
}

export const Ellipsis: React.FC<EllipsisProps> = ({ orientation = 'vertical', style = {} }) => {
  const isHorizontal = orientation === 'horizontal';

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minWidth: isHorizontal ? '2rem' : undefined,
        minHeight: isHorizontal ? '2rem' : '2rem',
        ...style,
      }}
    >
      <style>{`
        @keyframes pulse-dot {
          0%, 100% {
            opacity: 0.4;
            transform: ${isHorizontal ? 'scaleX(0.8)' : 'scaleY(0.8)'};
          }
          50% {
            opacity: 1;
            transform: ${isHorizontal ? 'scaleX(1.2)' : 'scaleY(1.2)'};
          }
        }

        .ellipsis-dot {
          display: inline-block;
          width: 0.4rem;
          height: 0.4rem;
          border-radius: 50%;
          background-color: var(--wa-color-text-secondary);
          margin: ${isHorizontal ? '0 0.15rem' : '0.15rem 0'};
          animation: pulse-dot 1.2s ease-in-out infinite;
        }

        .ellipsis-dot:nth-child(1) {
          animation-delay: 0s;
        }

        .ellipsis-dot:nth-child(2) {
          animation-delay: 0.2s;
        }

        .ellipsis-dot:nth-child(3) {
          animation-delay: 0.4s;
        }
      `}</style>

      <div
        style={{
          display: 'flex',
          flexDirection: isHorizontal ? 'row' : 'column',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <div className='ellipsis-dot' />
        <div className='ellipsis-dot' />
        <div className='ellipsis-dot' />
      </div>
    </div>
  );
};
