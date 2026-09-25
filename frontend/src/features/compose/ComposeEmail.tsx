import React, { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Papa from 'papaparse';
import { apiRequest } from '../../lib/api';
import { useToast } from '../../components/Toast';
import {
  UploadCloud,
  Clock,
  Send,
  X,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link2,
  Image as ImageIcon,
  Calendar,
  Check,
  ChevronDown,
  AlertCircle,
} from 'lucide-react';

export interface EmailSender {
  id: string;
  userId: string;
  fromAddress: string;
  fromName: string;
  createdAt?: string;
}

const composeSchema = z.object({
  senderId: z.string().min(1, 'Please select a sender identity'),
  subject: z.string().min(1, 'Subject line cannot be empty'),
  body: z.string().min(1, 'Email body cannot be empty'),
  delaySeconds: z.number().min(0.5, 'Minimum delay is 0.5s'),
  hourlyLimit: z.number().min(1, 'Hourly limit must be at least 1'),
});

type ComposeFormValues = z.infer<typeof composeSchema>;

export interface ComposeEmailProps {
  onClose?: () => void;
  onSuccess?: () => void;
  className?: string;
}

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const EXTRACT_EMAILS_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export const ComposeEmail: React.FC<ComposeEmailProps> = ({
  onClose,
  onSuccess,
  className = '',
}) => {
  const toast = useToast();

  const [senders, setSenders] = useState<EmailSender[]>([]);
  const [isLoadingSenders, setIsLoadingSenders] = useState(true);

  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState('');
  const [recipientError, setRecipientError] = useState<string | null>(null);
  const [detectedCountNotice, setDetectedCountNotice] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [attachedImage, setAttachedImage] = useState<{ url: string; name: string } | null>(null);

  const [isSendLaterOpen, setIsSendLaterOpen] = useState(false);
  const [scheduledTime, setScheduledTime] = useState<string | null>(null);
  const [customDateTime, setCustomDateTime] = useState('');
  const sendLaterRef = useRef<HTMLDivElement>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ComposeFormValues>({
    resolver: zodResolver(composeSchema),
    defaultValues: {
      senderId: '',
      subject: '',
      body: '',
      delaySeconds: 2,
      hourlyLimit: 50,
    },
  });

  const bodyValue = watch('body');
  const { ref: registerBodyRef, ...restBodyProps } = register('body');

  useEffect(() => {
    let isMounted = true;
    const loadSenders = async () => {
      try {
        setIsLoadingSenders(true);
        const res = await apiRequest<{ data?: EmailSender[]; senders?: EmailSender[] }>('/api/senders');
        const list = res.data || res.senders || [];
        if (isMounted) {
          setSenders(list);
          if (list.length > 0) {
            setValue('senderId', list[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load senders:', err);
      } finally {
        if (isMounted) setIsLoadingSenders(false);
      }
    };
    loadSenders();
    return () => {
      isMounted = false;
    };
  }, [setValue]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sendLaterRef.current && !sendLaterRef.current.contains(e.target as Node)) {
        setIsSendLaterOpen(false);
      }
    };
    if (isSendLaterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSendLaterOpen]);

  const handleAddRecipient = (value: string) => {
    const raw = value.trim();
    if (!raw) return;

    const matches = raw.match(EXTRACT_EMAILS_REGEX);
    if (matches && matches.length > 1) {
      const uniqueNew = Array.from(new Set(matches.map((m) => m.toLowerCase())));
      const merged = Array.from(new Set([...recipients, ...uniqueNew]));
      setRecipients(merged);
      setRecipientInput('');
      setRecipientError(null);
      setDetectedCountNotice(`${uniqueNew.length} recipients pasted`);
      return;
    }

    if (!EMAIL_REGEX.test(raw)) {
      setRecipientError('Please enter a valid email address');
      return;
    }

    const normalized = raw.toLowerCase();
    if (recipients.includes(normalized)) {
      setRecipientError('Email is already in the recipient list');
      return;
    }

    setRecipients([...recipients, normalized]);
    setRecipientInput('');
    setRecipientError(null);
  };

  const handleRecipientKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      e.preventDefault();
      handleAddRecipient(recipientInput);
    } else if (e.key === 'Backspace' && !recipientInput && recipients.length > 0) {

      setRecipients(recipients.slice(0, -1));
    }
  };

  const handleRemoveRecipient = (emailToRemove: string) => {
    setRecipients(recipients.filter((email) => email !== emailToRemove));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse<any>(file, {
      complete: (results) => {
        const textContent = JSON.stringify(results.data);
        const matches = textContent.match(EXTRACT_EMAILS_REGEX);

        if (!matches || matches.length === 0) {
          toast.error('No valid email addresses found in the uploaded file.', 'Upload Error');
          return;
        }

        const uniqueExtracted = Array.from(
          new Set(matches.map((email) => email.toLowerCase()))
        );
        const merged = Array.from(new Set([...recipients, ...uniqueExtracted]));

        setRecipients(merged);
        setRecipientError(null);
        setDetectedCountNotice(`${uniqueExtracted.length} recipients detected from "${file.name}"`);
        toast.success(`Extracted and deduped ${uniqueExtracted.length} recipient(s)!`);

        if (fileInputRef.current) fileInputRef.current.value = '';
      },
      error: (err) => {
        toast.error(err.message, 'CSV Parse Error');
      },
    });
  };

  const applyFormat = (wrapper: { open: string; close: string }) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = bodyValue || '';
    const selectedText = currentText.substring(start, end);

    const replacement = `${wrapper.open}${selectedText || 'text'}${wrapper.close}`;
    const newText = currentText.substring(0, start) + replacement + currentText.substring(end);

    setValue('body', newText);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + wrapper.open.length,
        start + wrapper.open.length + (selectedText.length || 4)
      );
    }, 0);
  };

  const handleImageAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const localUrl = URL.createObjectURL(file);
    setAttachedImage({ url: localUrl, name: file.name });
    toast.info(`Attached image: ${file.name}`);
  };

  const getTomorrowDate = (hours = 9, minutes = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(hours, minutes, 0, 0);
    return d;
  };

  const setQuickSchedule = (date: Date) => {
    setScheduledTime(date.toISOString());
    setCustomDateTime(formatDateTimeLocal(date));
    setIsSendLaterOpen(false);
  };

  const formatDateTimeLocal = (date: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
      date.getHours()
    )}:${pad(date.getMinutes())}`;
  };

  const formatDisplayTime = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const onFormSubmit = async (data: ComposeFormValues) => {
    if (recipients.length === 0) {
      setRecipientError('Please add at least one recipient email.');
      return;
    }

    try {
      setIsSubmitting(true);

      const startTime = scheduledTime
        ? new Date(scheduledTime).toISOString()
        : new Date(Date.now() + 1000).toISOString();

      let finalHtml = data.body;
      if (attachedImage) {
        finalHtml += `<br/><p><img src="${attachedImage.url}" alt="${attachedImage.name}" style="max-width: 100%; border-radius: 8px; margin-top: 12px;" /></p>`;
      }

      const idempotencyKey = crypto.randomUUID();

      const payload = {
        subject: data.subject,
        bodyHtml: finalHtml,
        recipients,
        senderId: data.senderId,
        startTime,
        delayBetweenEmailsMs: Math.round(data.delaySeconds * 1000),
        hourlyLimit: data.hourlyLimit,
        idempotencyKey,
      };

      const res = await apiRequest<{ message: string; jobCount: number }>('/api/emails/schedule', {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      const count = res.jobCount || recipients.length;
      toast.success(
        scheduledTime
          ? `Successfully scheduled batch of ${count} emails for ${formatDisplayTime(scheduledTime)}!`
          : `Successfully queued ${count} emails for immediate delivery!`
      );

      onSuccess?.();
      onClose?.();
    } catch (err: any) {
      console.error('Schedule error:', err);
      toast.error(err.message || 'Failed to schedule email batch. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`w-full max-w-2xl bg-white rounded-xl flex flex-col ${className}`}>
      <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col gap-4">

        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 pb-2 border-b border-slate-100">
          <label className="w-16 text-xs font-semibold text-slate-500 uppercase tracking-wider shrink-0">
            From
          </label>
          <div className="flex-1">
            <select
              {...register('senderId')}
              disabled={isLoadingSenders || senders.length === 0}
              className="w-full bg-slate-50 hover:bg-slate-100/70 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors cursor-pointer"
            >
              {senders.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fromName} &lt;{s.fromAddress}&gt;
                </option>
              ))}
              {senders.length === 0 && (
                <option value="">No senders found (creating default identity...)</option>
              )}
            </select>
            {errors.senderId && (
              <span className="text-[11px] text-red-500 mt-0.5">{errors.senderId.message}</span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5 pb-2 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              To
            </label>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv, .txt"
                onChange={handleFileUpload}
                className="hidden"
                id="upload-recipients-file"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-md border border-emerald-200/80 transition-colors cursor-pointer"
                title="Upload list of email addresses from CSV or TXT file"
              >
                <UploadCloud className="w-3.5 h-3.5 text-emerald-600" />
                <span>Upload List</span>
              </button>
            </div>
          </div>

          <div className="min-h-[46px] p-2 bg-slate-50/70 hover:bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-center gap-1.5 transition-colors focus-within:bg-white focus-within:ring-1 focus-within:ring-emerald-500 focus-within:border-emerald-500">
            {recipients.map((email) => (
              <span
                key={email}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-slate-200 text-xs font-medium text-slate-800 shadow-2xs group"
              >
                <span className="truncate max-w-[200px]">{email}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveRecipient(email)}
                  className="text-slate-400 hover:text-red-500 rounded p-0.5 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            <input
              type="text"
              placeholder={recipients.length === 0 ? "Type or paste recipients (comma or Enter to add)..." : "Add more..."}
              value={recipientInput}
              onChange={(e) => {
                setRecipientInput(e.target.value);
                if (recipientError) setRecipientError(null);
              }}
              onKeyDown={handleRecipientKeyDown}
              onBlur={() => {
                if (recipientInput.trim()) {
                  handleAddRecipient(recipientInput);
                }
              }}
              className="flex-1 min-w-[180px] bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none py-1 px-1"
            />
          </div>

          <div className="flex items-center justify-between text-[11px] px-0.5">
            {recipientError ? (
              <span className="text-red-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {recipientError}
              </span>
            ) : detectedCountNotice ? (
              <span className="text-emerald-700 font-medium flex items-center gap-1">
                <Check className="w-3 h-3" />
                {detectedCountNotice} ({recipients.length} total)
              </span>
            ) : (
              <span className="text-slate-400">
                {recipients.length > 0 ? `${recipients.length} recipient(s) added` : 'CSV, TXT, or pasted emails supported'}
              </span>
            )}

            {recipients.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setRecipients([]);
                  setDetectedCountNotice(null);
                }}
                className="text-[11px] text-slate-400 hover:text-red-500 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1 pb-2 border-b border-slate-100">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Subject
          </label>
          <input
            type="text"
            {...register('subject')}
            placeholder="Subject line"
            className="w-full bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
          />
          {errors.subject && (
            <span className="text-[11px] text-red-500">{errors.subject.message}</span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50/70 border border-slate-200/80 rounded-xl">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
              <span>Delay between 2 emails</span>
              <span className="text-[10px] text-slate-400 font-normal">sec</span>
            </label>
            <input
              type="number"
              step="0.5"
              min="0.5"
              {...register('delaySeconds', { valueAsNumber: true })}
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 shadow-2xs"
            />
            {errors.delaySeconds && (
              <span className="text-[10px] text-red-500">{errors.delaySeconds.message}</span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
              <span>Hourly Limit</span>
              <span className="text-[10px] text-slate-400 font-normal">emails/hr</span>
            </label>
            <input
              type="number"
              min="1"
              max="1000"
              {...register('hourlyLimit', { valueAsNumber: true })}
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 shadow-2xs"
            />
            {errors.hourlyLimit && (
              <span className="text-[10px] text-red-500">{errors.hourlyLimit.message}</span>
            )}
          </div>
        </div>

        <div className="flex flex-col border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white">

          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50/90 border-b border-slate-200 text-slate-600">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => applyFormat({ open: '<strong>', close: '</strong>' })}
                title="Bold"
                className="p-1 rounded hover:bg-slate-200/80 hover:text-slate-900 transition-colors"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => applyFormat({ open: '<em>', close: '</em>' })}
                title="Italic"
                className="p-1 rounded hover:bg-slate-200/80 hover:text-slate-900 transition-colors"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => applyFormat({ open: '<u>', close: '</u>' })}
                title="Underline"
                className="p-1 rounded hover:bg-slate-200/80 hover:text-slate-900 transition-colors"
              >
                <Underline className="w-3.5 h-3.5" />
              </button>

              <div className="h-4 w-px bg-slate-200 mx-1" />

              <button
                type="button"
                onClick={() => applyFormat({ open: '<ul><li>', close: '</li></ul>' })}
                title="Bulleted List"
                className="p-1 rounded hover:bg-slate-200/80 hover:text-slate-900 transition-colors"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => applyFormat({ open: '<ol><li>', close: '</li></ol>' })}
                title="Numbered List"
                className="p-1 rounded hover:bg-slate-200/80 hover:text-slate-900 transition-colors"
              >
                <ListOrdered className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => applyFormat({ open: '<a href="https://">', close: '</a>' })}
                title="Insert Link"
                className="p-1 rounded hover:bg-slate-200/80 hover:text-slate-900 transition-colors"
              >
                <Link2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-1">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageAttachment}
                className="hidden"
                id="compose-image-attachment"
              />
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                title="Attach Image"
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-slate-600 hover:bg-slate-200/80 hover:text-slate-900 transition-colors"
              >
                <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                <span>Image</span>
              </button>
            </div>
          </div>

          <textarea
            {...restBodyProps}
            ref={(e) => {
              registerBodyRef(e);
              textareaRef.current = e;
            }}
            rows={5}
            placeholder="Compose your email message here..."
            className="w-full p-3 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none resize-y min-h-[120px]"
          />

          {attachedImage && (
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img
                  src={attachedImage.url}
                  alt={attachedImage.name}
                  className="w-12 h-12 rounded-lg object-cover border border-slate-200 shadow-2xs"
                />
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-slate-800 truncate max-w-[200px]">
                    {attachedImage.name}
                  </span>
                  <span className="text-[10px] text-emerald-600 font-medium">Image attached</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAttachedImage(null)}
                className="p-1 rounded-md text-slate-400 hover:text-red-500 transition-colors"
                title="Remove attachment"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        {errors.body && (
          <span className="text-[11px] text-red-500">{errors.body.message}</span>
        )}

        {scheduledTime && (
          <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200/80 flex items-center justify-between text-xs text-emerald-800">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Scheduled for <strong>{formatDisplayTime(scheduledTime)}</strong>
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setScheduledTime(null);
                setCustomDateTime('');
              }}
              className="text-emerald-700 hover:text-red-600 text-[11px] font-medium underline"
            >
              Reset to immediate
            </button>
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2 relative" ref={sendLaterRef}>

            <button
              type="button"
              onClick={() => setIsSendLaterOpen(!isSendLaterOpen)}
              className="px-3.5 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            >
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>Send Later</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {isSendLaterOpen && (
              <div className="absolute right-0 bottom-full mb-2 w-72 bg-white border border-slate-200 rounded-xl shadow-xl p-3.5 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2.5">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                    Schedule for later
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsSendLaterOpen(false)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex flex-col gap-1 mb-3">
                  <button
                    type="button"
                    onClick={() => setQuickSchedule(getTomorrowDate(9, 0))}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <span>Tomorrow</span>
                    <span className="text-[10px] text-slate-400">9:00 AM</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickSchedule(getTomorrowDate(10, 0))}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <span>Tomorrow 10:00 AM</span>
                    <span className="text-[10px] text-slate-400">10:00 AM</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickSchedule(getTomorrowDate(11, 0))}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <span>Tomorrow 11:00 AM</span>
                    <span className="text-[10px] text-slate-400">11:00 AM</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickSchedule(getTomorrowDate(15, 0))}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <span>Tomorrow 3:00 PM</span>
                    <span className="text-[10px] text-slate-400">3:00 PM</span>
                  </button>
                </div>

                <div className="border-t border-slate-100 pt-2.5 flex flex-col gap-2">
                  <label className="text-[11px] font-semibold text-slate-600">
                    Custom date & time
                  </label>
                  <input
                    type="datetime-local"
                    value={customDateTime}
                    onChange={(e) => setCustomDateTime(e.target.value)}
                    min={formatDateTimeLocal(new Date())}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customDateTime) {
                        setScheduledTime(new Date(customDateTime).toISOString());
                        setIsSendLaterOpen(false);
                      } else {
                        toast.error('Please pick a custom date and time');
                      }
                    }}
                    className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-medium text-xs sm:text-sm shadow-sm shadow-emerald-600/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <span>Scheduling...</span>
                </>
              ) : scheduledTime ? (
                <>
                  <Clock className="w-3.5 h-3.5" />
                  <span>Schedule Send</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default ComposeEmail;
