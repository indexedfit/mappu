import MapCanvas from "./components/MapCanvas";
import EventLog from "./components/EventLog";

export default function App() {
  return (
    <div className="relative h-screen w-screen bg-black overflow-hidden">
      <MapCanvas />
      <EventLog />
    </div>
  );
}
