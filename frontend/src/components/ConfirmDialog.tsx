'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle } from 'lucide-react';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: 'default' | 'danger';
}

export interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const TRANSITION_MS = 200;

/**
 * 项目统一风格的确认弹窗（通过 Portal 挂载到 body，避免父级层叠上下文干扰）
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = '确定',
  cancelText = '取消',
  tone = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [mounted, setMounted] = useState(false);
  const [rendered, setRendered] = useState(open);
  const [visible, setVisible] = useState(false);

  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  // 控制进场/退场过渡动画（fade + scale）
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

  // 记录打开前的焦点并在关闭后归还
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

  // 初始焦点：危险操作优先落在「取消」按钮，常规操作落在「确定」按钮
  useEffect(() => {
    if (!open || !rendered || !mounted) return;
    const target = tone === 'danger' ? cancelBtnRef.current : confirmBtnRef.current;
    const raf = requestAnimationFrame(() => {
      target?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [open, rendered, mounted, tone]);

  // ESC 取消与 Tab 焦点环绕
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
        return;
      }

      if (e.key === 'Tab') {
        const cancelEl = cancelBtnRef.current;
        const confirmEl = confirmBtnRef.current;
        if (!cancelEl || !confirmEl) return;

        e.preventDefault();
        if (document.activeElement === cancelEl) {
          confirmEl.focus();
        } else {
          cancelEl.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!mounted || !rendered) return null;

  const isDanger = tone === 'danger';

  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && open) {
          onCancel();
        }
      }}
      className={`fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={`w-full max-w-sm bg-white dark:bg-[#1E201D] rounded-3xl p-6 border border-[#1C1D1B]/[0.06] dark:border-white/[0.08] shadow-card transition-all duration-200 ease-out ${
          visible
            ? 'opacity-100 scale-100 translate-y-0'
            : 'opacity-0 scale-95 translate-y-1'
        }`}
      >
        <div className="flex items-start gap-3.5">
          <div
            className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
              isDanger
                ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border-rose-200/60 dark:border-rose-800/40'
                : 'bg-forest-50 dark:bg-forest-900/40 text-forest-700 dark:text-forest-300 border-forest-200/60 dark:border-forest-800/40'
            }`}
          >
            {isDanger ? (
              <AlertTriangle className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
          </div>

          <div className="min-w-0 flex-1 pt-0.5">
            <h3
              id={titleId}
              className="text-base font-bold text-stone-900 dark:text-stone-100 leading-snug"
            >
              {title}
            </h3>
            {description && (
              <p
                id={descriptionId}
                className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-1.5 leading-relaxed"
              >
                {description}
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2.5">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={() => open && onCancel()}
            className="px-5 py-2.5 rounded-full text-xs sm:text-sm font-medium bg-white dark:bg-[#252724] text-stone-700 dark:text-stone-200 border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 transition-all active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50"
          >
            {cancelText}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={() => open && onConfirm()}
            className={`px-5 py-2.5 rounded-full text-xs sm:text-sm font-medium text-white shadow-soft transition-all active:scale-95 focus:outline-none focus-visible:ring-2 ${
              isDanger
                ? 'bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-500/60'
                : 'bg-forest-600 hover:bg-forest-700 focus-visible:ring-forest-500/60'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * 配套 Hook：以 async/await Promise 方式替代浏览器原生 confirm
 */
export function useConfirmDialog(): {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  dialog: JSX.Element;
} {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({ title: '' });
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  useEffect(() => {
    return () => {
      if (resolveRef.current) {
        resolveRef.current(false);
        resolveRef.current = null;
      }
    };
  }, []);

  const confirm = useCallback((opts: ConfirmOptions) => {
    if (resolveRef.current) {
      resolveRef.current(false);
      resolveRef.current = null;
    }
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setOpen(false);
    resolve?.(true);
  }, []);

  const handleCancel = useCallback(() => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setOpen(false);
    resolve?.(false);
  }, []);

  const dialog = (
    <ConfirmDialog
      open={open}
      title={options.title}
      description={options.description}
      confirmText={options.confirmText}
      cancelText={options.cancelText}
      tone={options.tone}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { confirm, dialog };
}

export default ConfirmDialog;
