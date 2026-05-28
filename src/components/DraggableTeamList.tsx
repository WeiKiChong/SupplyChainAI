import React, { useState } from 'react';
import { GripVertical, ArrowUp, ArrowDown, Plus, X, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../utils';
import { TeamCategory } from '../types';

interface DraggableTeamListProps {
  categories: TeamCategory[];
  onChange: (newCategories: TeamCategory[], newOrder: string[]) => void;
}

export function DraggableTeamList({ categories, onChange }: DraggableTeamListProps) {
  const [newTeam, setNewTeam] = useState('');
  const [targetCategory, setTargetCategory] = useState(categories[0]?.id || 'cat_xialiao');
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  // Trigger changes
  const updateChanges = (updatedCategories: TeamCategory[]) => {
    // Generate flat list of team names (preserving category ordering)
    const newOrder = updatedCategories.flatMap(c => c.teamNames);
    onChange(updatedCategories, newOrder);
  };

  // Add category reordering helper
  const moveCategoryUp = (idx: number) => {
    if (idx === 0) return;
    const nextCategories = [...categories];
    const temp = nextCategories[idx - 1];
    nextCategories[idx - 1] = nextCategories[idx];
    nextCategories[idx] = temp;
    // Update orders
    nextCategories.forEach((cat, index) => {
      cat.order = index + 1;
    });
    updateChanges(nextCategories);
  };

  const moveCategoryDown = (idx: number) => {
    if (idx === categories.length - 1) return;
    const nextCategories = [...categories];
    const temp = nextCategories[idx + 1];
    nextCategories[idx + 1] = nextCategories[idx];
    nextCategories[idx] = temp;
    // Update orders
    nextCategories.forEach((cat, index) => {
      cat.order = index + 1;
    });
    updateChanges(nextCategories);
  };

  // Team reordering helper (within the same category or cross categories)
  const moveTeamUp = (categoryIdx: number, teamIdx: number) => {
    if (teamIdx === 0) return;
    const nextCategories = JSON.parse(JSON.stringify(categories)) as TeamCategory[];
    const teams = nextCategories[categoryIdx].teamNames;
    const temp = teams[teamIdx - 1];
    teams[teamIdx - 1] = teams[teamIdx];
    teams[teamIdx] = temp;
    updateChanges(nextCategories);
  };

  const moveTeamDown = (categoryIdx: number, teamIdx: number) => {
    const nextCategories = JSON.parse(JSON.stringify(categories)) as TeamCategory[];
    const teams = nextCategories[categoryIdx].teamNames;
    if (teamIdx === teams.length - 1) return;
    const temp = teams[teamIdx + 1];
    teams[teamIdx + 1] = teams[teamIdx];
    teams[teamIdx] = temp;
    updateChanges(nextCategories);
  };

  // Remove team from a category
  const removeTeam = (categoryIdx: number, teamIdx: number) => {
    const nextCategories = JSON.parse(JSON.stringify(categories)) as TeamCategory[];
    nextCategories[categoryIdx].teamNames.splice(teamIdx, 1);
    updateChanges(nextCategories);
  };

  // Create new team
  const addTeam = () => {
    if (!newTeam.trim()) return;
    const nextCategories = JSON.parse(JSON.stringify(categories)) as TeamCategory[];
    const targetCat = nextCategories.find(c => c.id === targetCategory);
    if (!targetCat) return;

    // Check if team already exists anywhere to prevent duplicates
    const trimmed = newTeam.trim();
    const exists = nextCategories.some(c => c.teamNames.includes(trimmed));
    if (exists) return;

    targetCat.teamNames.push(trimmed);
    updateChanges(nextCategories);
    setNewTeam('');
  };

  const toggleCollapse = (catId: string) => {
    setCollapsedCategories(prev => ({
      ...prev,
      [catId]: !prev[catId]
    }));
  };

  // Simple HTML5 Drag and Drop for Categories
  const [draggedCatIdx, setDraggedCatIdx] = useState<number | null>(null);
  const handleCatDragStart = (e: React.DragEvent, idx: number) => {
    setDraggedCatIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleCatDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (draggedCatIdx === null || draggedCatIdx === idx) return;
    const nextCategories = [...categories];
    const draggedItem = nextCategories[draggedCatIdx];
    nextCategories.splice(draggedCatIdx, 1);
    nextCategories.splice(idx, 0, draggedItem);
    nextCategories.forEach((cat, index) => {
      cat.order = index + 1;
    });
    setDraggedCatIdx(idx);
    updateChanges(nextCategories);
  };

  // HTML5 Drag and Drop for Teams
  const [draggedTeam, setDraggedTeam] = useState<{ catIdx: number; teamIdx: number } | null>(null);

  const handleTeamDragStart = (e: React.DragEvent, catIdx: number, teamIdx: number) => {
    setDraggedTeam({ catIdx, teamIdx });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleTeamDragOver = (e: React.DragEvent, catIdx: number, teamIdx: number) => {
    e.preventDefault();
    if (!draggedTeam) return;

    if (draggedTeam.catIdx !== catIdx) {
      // Cross-category drag and drop!
      const nextCategories = JSON.parse(JSON.stringify(categories)) as TeamCategory[];
      const sourceTeams = nextCategories[draggedTeam.catIdx].teamNames;
      const targetTeams = nextCategories[catIdx].teamNames;
      const item = sourceTeams[draggedTeam.teamIdx];
      
      // Remove from source
      sourceTeams.splice(draggedTeam.teamIdx, 1);
      // Add to target at index
      targetTeams.splice(teamIdx, 0, item);
      
      setDraggedTeam({ catIdx, teamIdx });
      updateChanges(nextCategories);
      return;
    }

    if (draggedTeam.teamIdx === teamIdx) return;

    const nextCategories = JSON.parse(JSON.stringify(categories)) as TeamCategory[];
    const teams = nextCategories[catIdx].teamNames;
    const item = teams[draggedTeam.teamIdx];
    teams.splice(draggedTeam.teamIdx, 1);
    teams.splice(teamIdx, 0, item);

    setDraggedTeam({ catIdx, teamIdx });
    updateChanges(nextCategories);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Search/Add Section */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 flex flex-col md:flex-row gap-3 items-end">
        <div className="flex-1 space-y-1.5 w-full">
          <label className="text-xs font-semibold text-slate-500">班组名称</label>
          <input
            type="text"
            value={newTeam}
            onChange={(e) => setNewTeam(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTeam()}
            placeholder="输入新班组名称并按回车添加..."
            className="w-full text-sm px-3.5 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-medium text-slate-700"
          />
        </div>
        
        <div className="w-full md:w-52 space-y-1.5">
          <label className="text-xs font-semibold text-slate-500 font-medium">归属主类（分类排序依据）</label>
          <select
            value={targetCategory}
            onChange={(e) => setTargetCategory(e.target.value)}
            className="w-full text-sm px-3.5 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-semibold text-slate-700 cursor-pointer"
          >
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={addTeam}
          disabled={!newTeam.trim()}
          className="w-full md:w-auto px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5 text-sm font-semibold active:scale-95 duration-100 shadow-sm shadow-indigo-500/10"
        >
          <Plus size={16} />
          添加至分类
        </button>
      </div>

      {/* Categories container */}
      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
        {categories.map((cat, catIdx) => {
          const isCollapsed = !!collapsedCategories[cat.id];
          return (
            <div
              key={cat.id}
              onDragOver={(e) => handleCatDragOver(e, catIdx)}
              className={cn(
                "border border-slate-200/80 rounded-xl overflow-hidden transition-all shadow-sm bg-white",
                draggedCatIdx === catIdx ? "opacity-30 border-dashed border-indigo-400" : ""
              )}
            >
              {/* Category Header */}
              <div 
                className={cn(
                  "flex items-center justify-between px-4 py-2.5 border-b select-none transition-colors",
                  isCollapsed ? "border-b-transparent bg-slate-50/70" : "border-slate-100 bg-slate-50/90"
                )}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div 
                    draggable 
                    onDragStart={(e) => handleCatDragStart(e, catIdx)}
                    onDragEnd={() => setDraggedCatIdx(null)}
                    className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-indigo-600 p-1"
                    title="按住拖拽主类"
                  >
                    <GripVertical size={16} />
                  </div>
                  
                  <span className="flex-shrink-0 w-6 h-6 rounded bg-indigo-50 text-indigo-600 font-bold flex items-center justify-center text-xs">
                    {catIdx + 1}
                  </span>

                  <span className="font-bold text-slate-800 text-sm truncate">{cat.name}</span>
                  
                  <span className="flex-shrink-0 text-[10px] text-slate-400 bg-slate-200/50 px-2 py-0.5 rounded-full font-semibold">
                    {cat.teamNames.length} 个班组
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  {/* Reorder Category buttons */}
                  <button
                    onClick={() => moveCategoryUp(catIdx)}
                    disabled={catIdx === 0}
                    className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md disabled:opacity-20"
                    title="上移主类"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    onClick={() => moveCategoryDown(catIdx)}
                    disabled={catIdx === categories.length - 1}
                    className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md disabled:opacity-20"
                    title="下移主类"
                  >
                    <ArrowDown size={14} />
                  </button>
                  
                  <div className="w-px h-4 bg-slate-200 mx-1" />

                  {/* Collapse/Expand Toggle */}
                  <button
                    onClick={() => toggleCollapse(cat.id)}
                    className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-md transition-colors"
                    title={isCollapsed ? "展开" : "收起"}
                  >
                    {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                  </button>
                </div>
              </div>

              {/* Category Teams */}
              {!isCollapsed && (
                <div className="p-3 bg-white">
                  {cat.teamNames.length === 0 ? (
                    <div className="text-center py-5 text-slate-400 text-xs border border-dashed border-slate-100 rounded-lg bg-slate-50/30">
                      该主分类下暂无匹配班组。
                    </div>
                  ) : (
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {cat.teamNames.map((team, teamIdx) => (
                        <li
                          key={`${team}-${teamIdx}`}
                          draggable
                          onDragStart={(e) => handleTeamDragStart(e, catIdx, teamIdx)}
                          onDragOver={(e) => handleTeamDragOver(e, catIdx, teamIdx)}
                          onDragEnd={() => setDraggedTeam(null)}
                          className={cn(
                            "flex items-center justify-between p-2 rounded-lg border border-slate-100 bg-slate-50/50 transition-all hover:bg-slate-50 hover:border-slate-200/80 group",
                            draggedTeam && draggedTeam.catIdx === catIdx && draggedTeam.teamIdx === teamIdx
                              ? "opacity-45 bg-indigo-50/50 border-indigo-400 border-dashed"
                              : ""
                          )}
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div 
                              className="cursor-grab active:cursor-grabbing text-slate-350 hover:text-indigo-500 p-0.5"
                              title="拖拽排序"
                            >
                              <GripVertical size={13} />
                            </div>
                            <span className="text-[10px] font-semibold text-slate-400 w-5 text-right font-mono">
                              {teamIdx + 1}
                            </span>
                            <span className="text-xs font-semibold text-slate-700 truncate">{team}</span>
                          </div>

                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => moveTeamUp(catIdx, teamIdx)}
                              disabled={teamIdx === 0}
                              className="p-0.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded disabled:opacity-20"
                              title="上移"
                            >
                              <ArrowUp size={12} />
                            </button>
                            <button
                              onClick={() => moveTeamDown(catIdx, teamIdx)}
                              disabled={teamIdx === cat.teamNames.length - 1}
                              className="p-0.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded disabled:opacity-20"
                              title="下移"
                            >
                              <ArrowDown size={12} />
                            </button>

                            <button
                              onClick={() => removeTeam(catIdx, teamIdx)}
                              className="p-0.5 text-slate-400 hover:text-red-600 hover:bg-white rounded ml-1"
                              title="移除班组"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
