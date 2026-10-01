interface Props {
  size?: 'md' | 'lg';
  centered?: boolean;
}

export default function BrandBar({ size = 'md', centered = false }: Props) {
  return (
    <div className={`brand-bar${centered ? ' center' : ''}`}>
      <img src="/logo.png" alt="ExamFlow logo" className={`logo-img${size === 'lg' ? ' lg' : ''}`} />
    </div>
  );
}
