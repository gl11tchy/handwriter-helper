import { Link } from "react-router-dom";
import { PenLine, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex-1">
      <section className="py-20 md:py-32">
        <div className="container">
          <div className="flex flex-col items-center text-center space-y-6 max-w-3xl mx-auto">
            <div className="p-4 bg-primary/10 rounded-2xl">
              <PenLine className="h-12 w-12 text-primary" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              Handwriting Assignment Grader
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl">
              Create signed assignments, assess handwritten submissions in-browser, and share encrypted results.
            </p>
            <div className="pt-4">
              <Button size="lg" asChild>
                <Link to="/create">
                  <Plus className="mr-2 h-5 w-5" />
                  Create Assignment
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
