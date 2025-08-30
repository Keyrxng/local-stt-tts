/**
 * Create standardized error with context
 */
export function createServiceError(
  message: string,
  context: string,
  originalError?: Error | unknown
): Error {
  const errorMessage = originalError 
    ? `${context}: ${message} (${originalError instanceof Error ? originalError.message : String(originalError)})`
    : `${context}: ${message}`;
  
  const error = new Error(errorMessage);
  error.name = 'AIServiceError';
  return error;
}
