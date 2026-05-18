type PlaceholderPageProps = {
  title: string;
  description?: string;
};

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="flex flex-1 flex-col gap-3 p-8">
      <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
      <p className="max-w-xl text-sm text-zinc-400">
        {description ?? 'Module scaffold ready — business logic comes next.'}
      </p>
    </div>
  );
}
