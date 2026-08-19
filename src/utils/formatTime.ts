export const formatTime = (timeInSeconds: number) => {
  if (!timeInSeconds || isNaN(timeInSeconds)) return "0:00";
  
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = Math.floor(timeInSeconds % 60);
  
  // padStart додає нуль попереду, якщо секунд менше 10 (напр. "05" замість "5")
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};