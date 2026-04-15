import { ReactNode } from "react";

interface DashboardCardProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  iconBg?: string;
  children: ReactNode;
  className?: string;
  delay?: number;
}

const DashboardCard = ({
  title, subtitle, icon, iconBg = "bg-primary/10",
  children, className = "", delay = 0,
}: DashboardCardProps) => (
  <div
    className={`rounded-xl border border-border bg-card p-8 shadow-sm hover:shadow-lg transition-all duration-300 opacity-0 animate-fade-in ${className}`}
    style={{ animationDelay: `${delay}ms` }}
  >
    <div className="flex items-start gap-3 mb-6">
      {icon && (
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
          {icon}
        </div>
      )}
      <div>
        <h3 className="text-lg font-semibold text-card-foreground">{title}</h3>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {children}
  </div>
);

export default DashboardCard;
