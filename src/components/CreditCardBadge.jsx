import React, { useState } from 'react';

const CreditCardBadge = () => {
  const [isHovered, setIsHovered] = useState(false);
  
  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 mb-4 perspective-500">
      <div 
        className={`
          relative overflow-hidden
          flex items-center gap-3
          px-4 py-1.5
          rounded-lg 
          transition-all duration-300 ease-out
          border border-gray-200/30
          backdrop-blur-sm
          ${isHovered ? 
            'translate-y-[-2px] rotate-1 shadow-lg' : 
            'translate-y-0 rotate-0 shadow-sm'
          }
        `}
        style={{
          backgroundImage: isHovered ? 
            'linear-gradient(120deg, #d1d1d1 0%, #e8e8e8 45%, #d1d1d1 100%)' : 
            'linear-gradient(120deg, #e2e2e2 0%, #f5f5f5 100%)',
          boxShadow: isHovered ? 
            'inset 0 0 20px rgba(255,255,255,0.5), 0 4px 8px rgba(200, 200, 200, 0.25)' : 
            'inset 0 0 10px rgba(255,255,255,0.2), 0 2px 4px rgba(0,0,0,0.05)'
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" 
               style={{
                 backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)',
                 backgroundSize: '16px 16px'
               }}
          />
        </div>

        {/* Shine effect */}
        <div 
          className={`
            absolute inset-0 
            bg-gradient-to-r from-transparent via-white/60 to-transparent
            transition-transform duration-700 ease-out
            ${isHovered ? 'translate-x-full' : '-translate-x-full'}
          `}
        />

        {/* Horizontal stripe */}
        <div className={`
          absolute right-0 top-0 bottom-0
          w-16 
          transition-all duration-300
          ${isHovered ? 
            'bg-gradient-to-l from-slate-100/30 via-white/20 to-transparent' : 
            'bg-gradient-to-l from-gray-100/20 via-gray-50/10 to-transparent'
          }
        `} />

        {/* Swiss cross */}
        <div className={`
          relative w-2.5 h-2.5 
          flex items-center justify-center
          rounded-sm
          transition-all duration-300
          ${isHovered ? 
            'bg-red-600' : 
            'bg-gray-500'
          }
        `}>
          <div className={`
            absolute w-1.5 h-0.5
            ${isHovered ? 'bg-white' : 'bg-gray-100'}
            transition-colors duration-300
          `}/>
          <div className={`
            absolute h-1.5 w-0.5
            ${isHovered ? 'bg-white' : 'bg-gray-100'}
            transition-colors duration-300
          `}/>
        </div>

        {/* Content */}
        <span className={`
          relative font-mono text-xs font-medium tracking-wide
          transition-all duration-300
          ${isHovered ? 
            'text-gray-800' : 
            'text-gray-600'
          }
        `}>
          jg
        </span>
      </div>
      
      {/* Reflection */}
      <div 
        className={`
          w-full h-1 
          rounded-full mt-1 blur-sm
          transition-all duration-300
          ${isHovered ? 
            'bg-gradient-to-t from-gray-500/10 to-transparent opacity-100' : 
            'bg-gradient-to-t from-black/5 to-transparent opacity-0'
          }
        `}
      />
    </div>
  );
};

export default CreditCardBadge;