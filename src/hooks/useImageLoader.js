import { useState, useRef, useCallback } from 'react';
import { loadImageFromFile } from '../utils/imageUtils.js';

export function useImageLoader(onLoad) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const result = await loadImageFromFile(file);
      onLoad(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [onLoad]);

  const handleInputChange = useCallback((e) => {
    handleFile(e.target.files[0]);
  }, [handleFile]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
  }, []);

  return {
    loading,
    error,
    fileInputRef,
    openFilePicker,
    handleInputChange,
    handleDrop,
    handleDragOver,
  };
}
