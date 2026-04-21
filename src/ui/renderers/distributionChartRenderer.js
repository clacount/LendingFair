(function initializeDistributionChartRenderer(globalScope) {
  function getChartSegments(distribution, field) {
    const total = distribution.reduce((sum, entry) => sum + (Number(entry[field]) || 0), 0);

    if (!total) {
      return distribution.map((entry) => ({ officer: entry.officer, value: Number(entry[field]) || 0, percent: 0 }));
    }

    return distribution.map((entry) => ({
      officer: entry.officer,
      value: Number(entry[field]) || 0,
      percent: (Number(entry[field]) || 0) / total
    }));
  }

  function getDonutColor(index) {
    const palette = ['#126c45', '#d97706', '#2a4d84', '#8e44ad', '#c93d2b', '#0f9d58', '#7a8795', '#008b8b'];
    return palette[index % palette.length];
  }

  function drawDonutChart(config) {
    const { title, distribution, field, valueFormatter } = config;
    const canvas = document.createElement('canvas');
    canvas.width = 420;
    canvas.height = 340;

    const ctx = canvas.getContext('2d');
    const centerX = 120;
    const centerY = 145;
    const outerRadius = 70;
    const innerRadius = 40;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1c2430';
    ctx.font = 'bold 15px Arial';
    const titleLines = wrapChartTitle(ctx, title, 380);
    titleLines.forEach((line, index) => {
      ctx.fillText(line, 20, 28 + (index * 18));
    });

    const segments = getChartSegments(distribution, field);
    const totalValue = distribution.reduce((sum, entry) => sum + (Number(entry[field]) || 0), 0);

    if (!totalValue) {
      ctx.fillStyle = '#5e6b7a';
      ctx.font = '14px Arial';
      ctx.fillText('No data available', 55, centerY);
      return { canvas, imageDataUrl: canvas.toDataURL('image/png') };
    }

    let startAngle = -Math.PI / 2;
    segments.forEach((segment, index) => {
      const angle = segment.percent * Math.PI * 2;
      const endAngle = startAngle + angle;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = getDonutColor(index);
      ctx.fill();
      startAngle = endAngle;
    });

    ctx.beginPath();
    ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.fillStyle = '#1c2430';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Total', centerX, centerY - 4);
    ctx.font = 'bold 14px Arial';
    ctx.fillText(field === 'loanCount' ? String(totalValue) : valueFormatter(totalValue), centerX, centerY + 18);

    ctx.textAlign = 'left';
    let legendY = 76;
    segments.forEach((segment, index) => {
      const legendX = 225;
      ctx.fillStyle = getDonutColor(index);
      ctx.fillRect(legendX, legendY - 10, 12, 12);
      ctx.fillStyle = '#1c2430';
      ctx.font = '12px Arial';
      ctx.fillText(`${segment.officer}`, legendX + 18, legendY);
      ctx.fillText(`${valueFormatter(segment.value)} • ${(segment.percent * 100).toFixed(1)}%`, legendX + 18, legendY + 14);
      legendY += 34;
    });

    return { canvas, imageDataUrl: canvas.toDataURL('image/png') };
  }

  function wrapChartTitle(ctx, title, maxWidth) {
    const words = String(title || '').split(/\s+/).filter(Boolean);
    if (!words.length) {
      return [''];
    }

    const lines = [];
    let currentLine = words[0];
    for (let index = 1; index < words.length; index += 1) {
      const nextLine = `${currentLine} ${words[index]}`;
      if (ctx.measureText(nextLine).width <= maxWidth) {
        currentLine = nextLine;
      } else {
        lines.push(currentLine);
        currentLine = words[index];
      }
    }
    lines.push(currentLine);
    return lines.slice(0, 2);
  }

  globalScope.DistributionChartRenderer = { drawDonutChart };
})(window);
