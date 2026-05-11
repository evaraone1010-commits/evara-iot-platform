import { type LucideIcon, ArrowRight } from "lucide-react";

interface ActionCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  stats?: string;
  color: "blue" | "green" | "purple" | "amber" | "indigo";
  onClick?: () => void;
}

const colorStyles = {
  blue: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    text: "text-blue-500",
    hover: "group-hover:border-blue-500/50",
    iconBg: "bg-blue-500",
  },
  green: {
    bg: "bg-green-500/10",
    border: "border-green-500/20",
    text: "text-green-500",
    hover: "group-hover:border-green-500/50",
    iconBg: "bg-green-500",
  },
  purple: {
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
    text: "text-purple-500",
    hover: "group-hover:border-purple-500/50",
    iconBg: "bg-purple-500",
  },
  amber: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    text: "text-amber-500",
    hover: "group-hover:border-amber-500/50",
    iconBg: "bg-amber-500",
  },
  indigo: {
    bg: "bg-indigo-500/10",
    border: "border-indigo-500/20",
    text: "text-indigo-500",
    hover: "group-hover:border-indigo-500/50",
    iconBg: "bg-indigo-500",
  },
};

export const ActionCard = ({
  title,
  description,
  icon: Icon,
  stats,
  color,
  onClick,
}: ActionCardProps) => {
  const styles = colorStyles[color];

  return (
    <button
      onClick={onClick}
      className={`
                group relative flex flex-col items-start p-6 rounded-2xl border transition-all duration-300 w-full text-left
                apple-glass-card hover:bg-white/30 ${styles.border} hover:border-[color]-500/30 hover:shadow-md hover:-translate-y-1
            `}
    >
      <div className="flex w-full items-start justify-between mb-4">
        <div className={`p-3 rounded-xl ${styles.bg} ${styles.text}`}>
          <Icon size={24} />
        </div>
        {stats && (
          <span className="px-2 py-1 rounded-md action-badge text-[10px] font-bold">
            {stats}
          </span>
        )}
      </div>

      <h3 className="text-lg font-bold action-card-heading mb-1 group-hover:text-blue-600 transition-colors">
        {title}
      </h3>
      <p className="text-sm action-card-desc mb-6 leading-relaxed">
        {description}
      </p>

      <div
        className={`mt-auto flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${styles.text}`}
      >
        Action Required{" "}
        <ArrowRight
          size={14}
          className="group-hover:translate-x-1 transition-transform"
        />
      </div>
    </button>
  );
};
