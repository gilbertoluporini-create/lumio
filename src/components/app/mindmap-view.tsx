"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { LumiIcon } from "@/components/brand/lumi-icon";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type MindmapNode = {
  label: string;
  detail?: string;
  children?: MindmapNode[];
};

export type MindmapAsset = {
  generatedAt: string;
  centralTopic: string;
  branches: MindmapNode[];
};

// Cores cíclicas por branch top-level
const BRANCH_COLORS = [
  "from-rose-400 to-pink-500",
  "from-amber-400 to-orange-500",
  "from-emerald-400 to-teal-500",
  "from-sky-400 to-cyan-500",
  "from-violet-400 to-purple-500",
  "from-fuchsia-400 to-pink-500",
];

export function MindmapView({ asset }: { asset: MindmapAsset }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="gap-1.5 text-[10px]">
          <LumiIcon name="sparkle" size={14} /> Mapa mental
        </Badge>
        <span className="text-[11px] text-muted-foreground">
          {asset.branches.length} ramo{asset.branches.length === 1 ? "" : "s"}{" "}
          principal{asset.branches.length === 1 ? "" : "is"}
        </span>
      </div>

      {/* Tema central */}
      <div className="relative">
        <div className="mx-auto max-w-xl rounded-2xl border-2 border-primary/60 bg-gradient-to-br from-primary/10 via-card to-fuchsia-500/10 p-6 text-center shadow-lg shadow-primary/10">
          <p className="text-[10px] uppercase tracking-wider text-primary mb-2 font-medium">
            Tema central
          </p>
          <h2 className="text-xl md:text-2xl font-semibold leading-snug">
            {asset.centralTopic}
          </h2>
        </div>
      </div>

      {/* Branches em grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {asset.branches.map((branch, i) => (
          <BranchCard
            key={i}
            node={branch}
            color={BRANCH_COLORS[i % BRANCH_COLORS.length]}
            number={i + 1}
          />
        ))}
      </div>
    </div>
  );
}

function BranchCard({
  node,
  color,
  number,
}: {
  node: MindmapNode;
  color: string;
  number: number;
}) {
  return (
    <div className="relative rounded-2xl border border-border/60 bg-card overflow-hidden">
      <div
        className={cn(
          "absolute top-0 left-0 right-0 h-1 bg-gradient-to-r",
          color,
        )}
      />
      <div className="p-5">
        <div className="flex items-start gap-3 mb-3">
          <div
            className={cn(
              "h-8 w-8 shrink-0 rounded-md bg-gradient-to-br flex items-center justify-center text-white text-sm font-semibold font-mono",
              color,
            )}
          >
            {number}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold tracking-tight leading-snug">
              {node.label}
            </h3>
            {node.detail && (
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {node.detail}
              </p>
            )}
          </div>
        </div>

        {node.children && node.children.length > 0 && (
          <div className="ml-4 pl-3 border-l-2 border-border/40 space-y-1.5">
            {node.children.map((child, i) => (
              <TreeNode key={i} node={child} depth={1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TreeNode({ node, depth }: { node: MindmapNode; depth: number }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="text-sm">
      <button
        onClick={() => hasChildren && setExpanded((e) => !e)}
        className={cn(
          "w-full flex items-start gap-1.5 text-left py-1 rounded-md",
          hasChildren && "hover:bg-secondary/30",
        )}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
          )
        ) : (
          <span className="h-3.5 w-3.5 shrink-0 flex items-center justify-center mt-0.5">
            <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <span className="font-medium leading-snug">{node.label}</span>
          {node.detail && (
            <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
              {node.detail}
            </p>
          )}
        </div>
      </button>
      {hasChildren && expanded && depth < 3 && (
        <div className="ml-4 pl-3 border-l border-border/30 space-y-1 mt-1">
          {node.children!.map((child, i) => (
            <TreeNode key={i} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
