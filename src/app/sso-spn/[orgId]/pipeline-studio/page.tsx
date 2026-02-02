"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PipelineStudioLayout } from "@/components/pipeline-studio";
import { Spinner } from "@/components/ui/spinner";

function PipelineStudioContent() {
  const searchParams = useSearchParams();
  const pipelineId = searchParams.get("id");

  return <PipelineStudioLayout pipelineId={pipelineId} />;
}

export default function PipelineStudioPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-full">
          <Spinner className="h-8 w-8 text-emerald-600" />
        </div>
      }
    >
      <PipelineStudioContent />
    </Suspense>
  );
}
