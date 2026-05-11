import { useState, useCallback } from 'react';

export interface LoadingState {
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  isLoading: boolean;
}

export interface UseLoadingStatesReturn extends LoadingState {
  setCreating: (loading: boolean) => void;
  setUpdating: (loading: boolean) => void;
  setDeleting: (loading: boolean) => void;
  reset: () => void;
}

export const useLoadingStates = (): UseLoadingStatesReturn => {
  const [state, setState] = useState<LoadingState>({
    isCreating: false,
    isUpdating: false,
    isDeleting: false,
    isLoading: false
  });

  const setCreating = useCallback((loading: boolean) => {
    setState(prev => ({
      ...prev,
      isCreating: loading,
      isLoading: loading || prev.isUpdating || prev.isDeleting
    }));
  }, []);

  const setUpdating = useCallback((loading: boolean) => {
    setState(prev => ({
      ...prev,
      isUpdating: loading,
      isLoading: loading || prev.isCreating || prev.isDeleting
    }));
  }, []);

  const setDeleting = useCallback((loading: boolean) => {
    setState(prev => ({
      ...prev,
      isDeleting: loading,
      isLoading: loading || prev.isCreating || prev.isUpdating
    }));
  }, []);

  const reset = useCallback(() => {
    setState({
      isCreating: false,
      isUpdating: false,
      isDeleting: false,
      isLoading: false
    });
  }, []);

  return {
    ...state,
    setCreating,
    setUpdating,
    setDeleting,
    reset
  };
};

// Hook for managing form submission states
export interface FormState {
  isSubmitting: boolean;
  isSubmitted: boolean;
  error: string | null;
}

export interface UseFormStateReturn extends FormState {
  setSubmitting: (submitting: boolean) => void;
  setSubmitted: (submitted: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useFormState = (): UseFormStateReturn => {
  const [state, setState] = useState<FormState>({
    isSubmitting: false,
    isSubmitted: false,
    error: null
  });

  const setSubmitting = useCallback((submitting: boolean) => {
    setState(prev => ({ ...prev, isSubmitting: submitting }));
  }, []);

  const setSubmitted = useCallback((submitted: boolean) => {
    setState(prev => ({ ...prev, isSubmitted: submitted }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, error }));
  }, []);

  const reset = useCallback(() => {
    setState({
      isSubmitting: false,
      isSubmitted: false,
      error: null
    });
  }, []);

  return {
    ...state,
    setSubmitting,
    setSubmitted,
    setError,
    reset
  };
};
