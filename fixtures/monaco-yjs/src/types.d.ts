declare module "*?worker" {
  const WorkerClass: new () => Worker;
  export default WorkerClass;
}
