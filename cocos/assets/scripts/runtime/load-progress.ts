/** Track one resource-loading attempt; late completions from an earlier
 * attempt must never advance or replace the retry's progress. */
export class LoadProgress {
  private generation=0;
  private total=1;
  private completed=0;
  private active=false;

  begin(total:number):number {
    if(!Number.isSafeInteger(total)||total<=0)throw new Error('Expected a positive resource count');
    this.generation++;this.total=total;this.completed=0;this.active=true;
    return this.generation;
  }
  advance(generation:number):number|null {
    if(!this.active||generation!==this.generation)return null;
    this.completed=Math.min(this.total,this.completed+1);
    return this.completed/this.total;
  }
  isCurrent(generation:number):boolean {return this.active&&generation===this.generation;}
  invalidate(generation:number):boolean {
    if(!this.isCurrent(generation))return false;
    this.active=false;return true;
  }
  cancel():void {this.active=false;this.generation++;}
}
