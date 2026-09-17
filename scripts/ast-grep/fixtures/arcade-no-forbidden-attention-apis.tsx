// Violation fixture for arcade-no-forbidden-attention-apis.
export const Bad = () => {
  playSound('win');
  return null;
};
