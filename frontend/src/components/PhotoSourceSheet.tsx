'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, ImagePlus } from 'lucide-react';

export type PhotoSource = 'camera' | 'library';

export interface PhotoSourceSheetProps {
  open: boolean;
  onClose: () => void;
  onPick: (source: PhotoSource) => void;
  title?: string;
  hint?: string;
}

const TRANSITION_MS = 200;

/**
 * 应用内照片来源选择底部面板（通过 Portal 挂载到 body，替代系统原生弹窗）
 */
export function PhotoSourceSheet({
  open,
  onClose,
  onPick,
  title = '选择照片来源',
  hint,
}: PhotoSourceSheetProps) {
  const [mounted, setMounted] = useState(false);
  const [rendered, setRendered] = useState(open);
  const [visible, setVisible] = useState(false);

  const cameraBtnRef = useRef<HTMLButtonElement>(null);
  const libraryBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const titleId = useId();
  const hintId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  // 控制遮罩淡入淡出与面板上滑/下滑过渡
  useEffect(() => {
    if (open) {
      setRendered(true);
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          setVisible(true);
        });
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }

    setVisible(false);
    const timer = setTimeout(() => {
      setRendered(false);
    }, TRANSITION_MS);
    return () => clearTimeout(timer);
  }, [open]);

  // 打开时锁定 body 滚动，关闭后恢复
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // 记录打开前焦点并在关闭后归还
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    return () => {
      const prev = previousFocusRef.current;
      previousFocusRef.current = null;
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
        prev.focus();
      }
    };
  }, [open]);

  // 打开时焦点落到第一个选项
  useEffect(() => {
    if (!open || !rendered || !mounted) return;
    const raf = requestAnimationFrame(() => {
      cameraBtnRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [open, rendered, mounted]);

  // ESC 关闭与 Tab 焦点环绕
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (e.key === 'Tab') {
        const focusables = [
          cameraBtnRef.current,
          libraryBtnRef.current,
          cancelBtnRef.current,
        ].filter((el): el is HTMLButtonElement => Boolean(el));
        if (focusables.length === 0) return;

        e.preventDefault();
        const currentIndex = focusables.indexOf(
          document.activeElement as HTMLButtonElement
        );
        if (e.shiftKey) {
          const prevIndex =
            currentIndex <= 0 ? focusables.length - 1 : currentIndex - 1;
          focusables[prevIndex].focus();
        } else {
          const nextIndex =
            currentIndex === -1 || currentIndex >= focusables.length - 1
              ? 0
              : currentIndex + 1;
          focusables[nextIndex].focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  if (!mounted || !rendered) return null;

  // 在用户点击手势栈内同步触发隐藏 input，确保浏览器允许弹出对应选择器
  const handleSelect = (source: PhotoSource) => {
    if (!open) return;
    onPick(source);
    onClose();
  };

  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && open) {
          onClose();
        }
      }}
      className={`fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'opacity-0'
      } ${open ? '' : 'pointer-events-none'}`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={hint ? hintId : undefined}
        className={`fixed inset-x-0 bottom-0 mx-auto w-full max-w-lg bg-white dark:bg-[#1E201D] rounded-t-3xl border-t border-[#1C1D1B]/[0.06] dark:border-white/[0.08] shadow-card px-5 pt-3.5 pb-[max(1rem,env(safe-area-inset-bottom))] transition-all duration-200 ease-out ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
        }`}
      >
        <div
          aria-hidden="true"
          className="w-9 h-1 rounded-full bg-stone-200 dark:bg-stone-700 mx-auto mb-3.5"
        />

        <div className="px-1">
          <h3
            id={titleId}
            className="text-base font-bold text-stone-900 dark:text-stone-100 leading-snug"
          >
            {title}
          </h3>
          {hint && (
            <p
              id={hintId}
              className="text-xs text-stone-500 dark:text-stone-400 mt-1 leading-relaxed"
            >
              {hint}
            </p>
          )}
        </div>

        <div className="mt-4 space-y-2">
          <button
            ref={cameraBtnRef}
            type="button"
            onClick={() => handleSelect('camera')}
            className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl text-left hover:bg-stone-50 dark:hover:bg-stone-800 active:scale-[0.99] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-500/50"
          >
            <span className="w-10 h-10 rounded-2xl bg-forest-50 dark:bg-forest-900/40 text-forest-700 dark:text-forest-300 border border-forest-200/60 dark:border-forest-800/40 flex items-center justify-center shrink-0">
              <Camera className="w-5 h-5 text-forest-700 dark:text-forest-300" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-stone-900 dark:text-stone-100">
                拍照
              </span>
              <span className="block text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                打开相机，直接拍冰箱内部
              </span>
            </span>
          </button>

          <button
            ref={libraryBtnRef}
            type="button"
            onClick={() => handleSelect('library')}
            className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl text-left hover:bg-stone-50 dark:hover:bg-stone-800 active:scale-[0.99] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-500/50"
          >
            <span className="w-10 h-10 rounded-2xl bg-forest-50 dark:bg-forest-900/40 text-forest-700 dark:text-forest-300 border border-forest-200/60 dark:border-forest-800/40 flex items-center justify-center shrink-0">
              <ImagePlus className="w-5 h-5 text-forest-700 dark:text-forest-300" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-stone-900 dark:text-stone-100">
                从相册选择
              </span>
              <span className="block text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                选一张已经拍好的照片
              </span>
            </span>
          </button>
        </div>

        <div className="mt-4">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={() => open && onClose()}
            className="w-full py-3 px-5 rounded-full text-sm font-medium bg-white dark:bg-[#252724] text-stone-700 dark:text-stone-200 border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 transition-all active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50"
          >
            取消
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default PhotoSourceSheet;
