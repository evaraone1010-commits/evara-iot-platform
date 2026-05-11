/**
 * ThingSpeakNodeProvisioner.tsx
 *
 * Production-ready component for provisioning a ThingSpeak data node.
 *
 * Architecture:
 *  - Inputs (Channel ID, Read API Key) are managed by react-hook-form + zod.
 *  - ThingSpeak API fetch logic is fully encapsulated in useThingSpeakFields().
 *  - Field rows have enter/exit animations via framer-motion.
 *  - Sonner is used for toast feedback (success / error).
 *  - Tailwind CSS for styling (no external shadcn components needed beyond
 *    what's already in the codebase; uses only native HTML + Tailwind).
 *
 * Exports:
 *  - ThingSpeakNodeProvisioner (default) — the complete self-contained component.
 *  - ThingSpeakFormValues type — if callers need to type the onSubmit callback.
 */

import { useState, useCallback, useId } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Loader2,
  Search,
  PlusCircle,
  Trash2,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  Wifi,
} from 'lucide-react';

import { useThingSpeakFields } from '../hooks/useThingSpeakFields';
import {
  thingSpeakNodeSchema,
  type ThingSpeakNodeFormValues,
} from '../schemas/thingSpeakNodeSchema';

export type { ThingSpeakNodeFormValues };

// ── Types ─────────────────────────────────────────────────────────────────────

interface ThingSpeakNodeProvisionerProps {
  /**
   * Called after the user fills out the form and clicks "Submit".
   * The caller is responsible for sending data to the backend.
   */
  onSubmit: (values: ThingSpeakNodeFormValues) => Promise<void> | void;
  /** Optional initial values (e.g. when editing an existing node). */
  defaultValues?: Partial<ThingSpeakNodeFormValues>;
  /** Optional label for the submit button (defaults to "Provision Node"). */
  submitLabel?: string;
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface FieldRowProps {
  index: number;
  value: string;
  allSelected: string[];
  onSelect: (idx: number, value: string) => void;
  onRemove: (idx: number) => void;
  fields: { key: string; label: string }[];
  canRemove: boolean;
}

const FieldRow = ({
  index,
  value,
  allSelected,
  onSelect,
  onRemove,
  fields,
  canRemove,
}: FieldRowProps) => {
  const selectId = useId();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-3"
    >
      {/* Field Number Badge */}
      <span className="w-6 h-6 flex items-center justify-center rounded-full bg-blue-100 text-blue-600 text-[11px] font-bold flex-shrink-0">
        {index + 1}
      </span>

      {/* Select */}
      <div className="relative flex-1">
        <select
          id={selectId}
          value={value}
          onChange={(e) => onSelect(index, e.target.value)}
          className="w-full appearance-none rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2.5 pr-10 text-sm font-medium text-slate-700 dark:text-slate-300 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 hover:border-slate-300 dark:hover:border-slate-500"
        >
          <option value="">— Select a field —</option>
          {fields.map((f) => {
            const isSelectedElsewhere = allSelected.includes(f.key) && f.key !== value;
            return (
              <option key={f.key} value={f.key} disabled={isSelectedElsewhere}>
                {f.label}{isSelectedElsewhere ? ' (in use)' : ''}
              </option>
            );
          })}
        </select>
        <ChevronDown
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
        />
      </div>

      {/* Remove button */}
      <button
        type="button"
        onClick={() => onRemove(index)}
        disabled={!canRemove}
        aria-label={`Remove field ${index + 1}`}
        className={`p-2 rounded-xl transition-all ${
          canRemove
            ? 'text-red-400 hover:bg-red-50 hover:text-red-600 active:scale-95'
            : 'text-slate-200 cursor-not-allowed'
        }`}
      >
        <Trash2 size={16} />
      </button>
    </motion.div>
  );
};

// ── Inline Input with label ───────────────────────────────────────────────────

interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

const FormInput = ({ label, error, hint, id, ...props }: FormInputProps) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={id} className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
      {label}
    </label>
    <input
      id={id}
      {...props}
      className={`w-full rounded-xl border px-4 py-2.5 text-sm font-medium text-slate-800 dark:text-white shadow-sm transition-all placeholder:text-slate-300 dark:placeholder:text-slate-500
        focus:outline-none focus:ring-2 focus:ring-blue-500/40
        ${error
          ? 'border-red-400 bg-red-50/30 focus:border-red-400'
          : 'border-slate-200 bg-white focus:border-blue-400 hover:border-slate-300'
        }
        disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed`}
    />
    {hint && !error && <p className="text-[11px] text-slate-400 dark:text-slate-500">{hint}</p>}
    {error && (
      <p className="flex items-center gap-1 text-[11px] text-red-500 font-medium">
        <AlertCircle size={11} />
        {error}
      </p>
    )}
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────

export default function ThingSpeakNodeProvisioner({
  onSubmit,
  defaultValues,
  submitLabel = 'Provision Node',
}: ThingSpeakNodeProvisionerProps) {
  const {
    availableFields,
    isFetching: isFieldFetching,
    error: fetchError,
    fetchFields,
    reset: resetFields,
  } = useThingSpeakFields();

  // ── Form ────────────────────────────────────────────────────────────────────

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ThingSpeakNodeFormValues>({
    resolver: zodResolver(thingSpeakNodeSchema),
    defaultValues: {
      channelId: defaultValues?.channelId ?? '',
      readApiKey: defaultValues?.readApiKey ?? '',
      selectedFields: defaultValues?.selectedFields ?? [''],
    },
  });

  const [isSubmitLoading, setIsSubmitLoading] = useState(false);

  // ── Local field-row state ────────────────────────────────────────────────────
  // We maintain a local array that mirrors form.selectedFields so we can
  // manipulate rows independently and then sync to the form on change.
  const [fieldRows, setFieldRows] = useState<string[]>(
    defaultValues?.selectedFields?.length ? defaultValues.selectedFields : ['']
  );

  const syncFieldsToForm = useCallback(
    (rows: string[]) => {
      setValue('selectedFields', rows, { shouldValidate: true });
    },
    [setValue]
  );

  // Reset field rows when channel inputs change.
  const channelId = watch('channelId');
  const readApiKey = watch('readApiKey');

  const handleInputBlurReset = useCallback(() => {
    // If the user modifies inputs after a successful fetch, reset field data.
    if (availableFields.length > 0) {
      resetFields();
      const emptyRows = [''];
      setFieldRows(emptyRows);
      syncFieldsToForm(emptyRows);
    }
  }, [availableFields.length, resetFields, syncFieldsToForm]);

  // ── Fetch handler ────────────────────────────────────────────────────────────

  const handleFetch = async () => {
    const id = channelId.trim();
    const key = readApiKey.trim();

    if (!id || !key) {
      toast.error('Enter Channel ID and Read API Key first.');
      return;
    }
    if (!/^\d+$/.test(id)) {
      toast.error('Channel ID must be a number.');
      return;
    }

    // Reset rows to a single empty row before re-fetching.
    const emptyRows = [''];
    setFieldRows(emptyRows);
    syncFieldsToForm(emptyRows);
    resetFields();

    await fetchFields(id, key);
  };

  // After a successful fetch, show a toast.
  const prevFieldCount = fieldRows.length;
  if (availableFields.length > 0 && fieldRows[0] === '' && prevFieldCount <= 1) {
    // Intentionally not triggering a re-render here; fetchFields already updates state.
  }

  // ── Field-row handlers ───────────────────────────────────────────────────────

  const handleFieldSelect = (idx: number, value: string) => {
    const updated = [...fieldRows];
    updated[idx] = value;
    setFieldRows(updated);
    syncFieldsToForm(updated);
  };

  const handleAddRow = () => {
    if (availableFields.length === 0) {
      toast.info('Fetch fields first before adding more selections.');
      return;
    }
    const updated = [...fieldRows, ''];
    setFieldRows(updated);
    syncFieldsToForm(updated);
  };

  const handleRemoveRow = (idx: number) => {
    if (fieldRows.length <= 1) return; // Maintain at least one row.
    const updated = fieldRows.filter((_, i) => i !== idx);
    setFieldRows(updated);
    syncFieldsToForm(updated);
  };

  // ── Submit ───────────────────────────────────────────────────────────────────

  const onFormSubmit = async (values: ThingSpeakNodeFormValues) => {
    // Filter out empty placeholder rows before submitting.
    const cleaned: ThingSpeakNodeFormValues = {
      ...values,
      selectedFields: values.selectedFields.filter(Boolean),
    };

    if (cleaned.selectedFields.length === 0) {
      toast.error('Select at least one field before submitting.');
      return;
    }

    setIsSubmitLoading(true);
    try {
      await onSubmit(cleaned);
      toast.success('Node provisioned successfully!');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Provisioning failed.';
      toast.error(msg);
    } finally {
      setIsSubmitLoading(false);
    }
  };

  // ── Derived state for UI ─────────────────────────────────────────────────────

  const hasFetchedFields = availableFields.length > 0;
  const canAddMore = hasFetchedFields && fieldRows.length < availableFields.length;
  const isLoading = isSubmitting || isSubmitLoading;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit(onFormSubmit)}
        className="w-full max-w-lg"
        noValidate
      >
        {/* ── Card ── */}
        <div
          className="rounded-3xl shadow-2xl shadow-slate-200/80 overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(20px)' }}
        >
          {/* Header */}
          <div className="px-8 pt-8 pb-6 border-b border-slate-100">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-200">
                <Wifi size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-lg font-black text-slate-900 dark:text-white leading-tight">
                  ThingSpeak Node
                </h1>
                <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                  Provision a new IoT data channel
                </p>
              </div>
            </div>
          </div>

          <div className="px-8 py-6 flex flex-col gap-6">

            {/* ── Step 1: Credentials ── */}
            <section className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-black flex items-center justify-center">1</span>
                <h2 className="text-xs font-bold text-slate-600 uppercase tracking-widest">
                  Channel Credentials
                </h2>
              </div>

              <Controller
                name="channelId"
                control={control}
                render={({ field }) => (
                  <FormInput
                    {...field}
                    id="channelId"
                    label="Channel ID"
                    placeholder="e.g. 12345"
                    inputMode="numeric"
                    error={errors.channelId?.message}
                    hint="The numeric ID from your ThingSpeak channel."
                    onBlur={handleInputBlurReset}
                  />
                )}
              />

              <Controller
                name="readApiKey"
                control={control}
                render={({ field }) => (
                  <FormInput
                    {...field}
                    id="readApiKey"
                    label="Read API Key"
                    placeholder="e.g. XXXXXXXXXXXXXXXX"
                    type="password"
                    autoComplete="one-time-code"
                    error={errors.readApiKey?.message}
                    hint="Found under API Keys in your ThingSpeak channel settings."
                    onBlur={handleInputBlurReset}
                  />
                )}
              />

              {/* Fetch Button */}
              <button
                type="button"
                onClick={handleFetch}
                disabled={isFieldFetching}
                className="flex items-center justify-center gap-2 w-full rounded-xl bg-gradient-to-r from-slate-700 to-slate-900 text-white text-sm font-bold py-3 shadow-md shadow-slate-200 transition-all hover:from-slate-600 hover:to-slate-800 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isFieldFetching ? (
                  <><Loader2 size={16} className="animate-spin" /> Fetching Fields…</>
                ) : (
                  <><Search size={16} /> Fetch Fields</>
                )}
              </button>

              {/* Fetch error */}
              <AnimatePresence mode="wait">
                {fetchError && (
                  <motion.div
                    key="fetch-error"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-3"
                  >
                    <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-red-600 font-medium">{fetchError}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Success indicator */}
              <AnimatePresence>
                {hasFetchedFields && !fetchError && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-100 px-4 py-3"
                  >
                    <CheckCircle2 size={16} className="text-green-500 flex-shrink-0" />
                    <p className="text-sm text-green-700 font-medium">
                      {availableFields.length} field{availableFields.length !== 1 ? 's' : ''} found:{' '}
                      <span className="font-semibold">
                        {availableFields.map((f) => f.label).join(', ')}
                      </span>
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>

            {/* ── Step 2: Field Selection ── */}
            <section className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <span className={`w-5 h-5 rounded-full text-white text-[10px] font-black flex items-center justify-center transition-colors ${hasFetchedFields ? 'bg-blue-600' : 'bg-slate-300'}`}>2</span>
                <h2 className="text-xs font-bold text-slate-600 uppercase tracking-widest">
                  Select Data Fields
                </h2>
              </div>

              {!hasFetchedFields && (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-5 text-center">
                  <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
                    Fetch fields above to configure data mappings.
                  </p>
                </div>
              )}

              {hasFetchedFields && (
                <div className="flex flex-col gap-3">
                  <AnimatePresence initial={false}>
                    {fieldRows.map((val, idx) => (
                      <FieldRow
                        key={idx}
                        index={idx}
                        value={val}
                        allSelected={fieldRows}
                        onSelect={handleFieldSelect}
                        onRemove={handleRemoveRow}
                        fields={availableFields}
                        canRemove={fieldRows.length > 1}
                      />
                    ))}
                  </AnimatePresence>

                  {/* Validation error on selectedFields */}
                  {errors.selectedFields && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center gap-1 text-[11px] text-red-500 font-medium"
                    >
                      <AlertCircle size={11} />
                      {errors.selectedFields.message ?? (errors.selectedFields as any)?.[0]?.message}
                    </motion.p>
                  )}

                  {/* Add Row */}
                  {canAddMore && (
                    <motion.button
                      type="button"
                      onClick={handleAddRow}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center gap-2 self-start text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors active:scale-95"
                    >
                      <PlusCircle size={15} />
                      Add another field
                    </motion.button>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* ── Footer / Submit ── */}
          <div className="px-8 pb-8">
            <button
              type="submit"
              disabled={isLoading || !hasFetchedFields}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-sm font-black py-3.5 shadow-lg shadow-blue-200 transition-all hover:from-blue-600 hover:to-indigo-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <><Loader2 size={16} className="animate-spin" /> Provisioning…</>
              ) : (
                submitLabel
              )}
            </button>
          </div>
        </div>

        {/* Footer hint */}
        <p className="mt-4 text-center text-[11px] text-slate-400 dark:text-slate-500 font-medium">
          Data is fetched directly from ThingSpeak. No proxy required.
        </p>
      </form>
    </div>
  );
}
