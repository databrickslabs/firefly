"use client";

interface CopyTokenButtonProps {
  token: string;
}

export function CopyTokenButton({ token }: CopyTokenButtonProps) {
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(token);
      }}
      className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
    >
      Copy Token
    </button>
  );
}
