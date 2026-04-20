import React, { useMemo, useState } from 'react';
import { getBillboards, getClients, ZIM_TOWNS } from '../services/mockData';
import { generateAvailabilityReportPDF } from '../services/pdfGenerator';
import { Billboard, BillboardType } from '../types';
import { Search, Download, CheckCircle, CircleSlash, Layers, TrendingUp } from 'lucide-react';

type StatusBucket = 'Available' | 'Partial' | 'Booked';

interface BillboardRow {
    billboard: Billboard;
    capacity: number;
    rented: number;
    available: number;
    bucket: StatusBucket;
    detail: string;
}

const deriveRow = (b: Billboard, clientName: (id?: string) => string): BillboardRow => {
    if (b.type === BillboardType.LED) {
        const total = b.totalSlots ?? 0;
        const rented = Math.min(b.rentedSlots ?? 0, total);
        const available = Math.max(0, total - rented);
        const bucket: StatusBucket = rented === 0 ? 'Available' : rented >= total ? 'Booked' : 'Partial';
        return {
            billboard: b,
            capacity: total,
            rented,
            available,
            bucket,
            detail: total > 0 ? `${rented}/${total} slots rented` : 'No slots configured',
        };
    }
    // Static: 2 sides
    const a = b.sideAStatus === 'Rented' ? 1 : 0;
    const bS = b.sideBStatus === 'Rented' ? 1 : 0;
    const rented = a + bS;
    const bucket: StatusBucket = rented === 0 ? 'Available' : rented === 2 ? 'Booked' : 'Partial';
    const aLabel = b.sideAStatus === 'Rented' ? clientName(b.sideAClientId) : 'Vacant';
    const bLabel = b.sideBStatus === 'Rented' ? clientName(b.sideBClientId) : 'Vacant';
    return {
        billboard: b,
        capacity: 2,
        rented,
        available: 2 - rented,
        bucket,
        detail: `A: ${aLabel} · B: ${bLabel}`,
    };
};

const bucketStyles: Record<StatusBucket, { bg: string; text: string; label: string }> = {
    Available: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Available' },
    Partial:   { bg: 'bg-amber-50',   text: 'text-amber-700',   label: 'Partial' },
    Booked:    { bg: 'bg-red-50',     text: 'text-red-700',     label: 'Fully Booked' },
};

export const Availability: React.FC = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [townFilter, setTownFilter] = useState<string>('All');
    const [typeFilter, setTypeFilter] = useState<'All' | BillboardType>('All');
    const [statusFilter, setStatusFilter] = useState<'All' | StatusBucket>('All');

    const billboards = getBillboards();
    const clients = getClients();
    const clientName = (id?: string) => clients.find(c => c.id === id)?.companyName || 'Unknown';

    const rows: BillboardRow[] = useMemo(
        () => billboards.map(b => deriveRow(b, clientName)),
        [billboards, clients],
    );

    const filtered = rows.filter(r => {
        const b = r.billboard;
        const matchesSearch = !searchTerm ||
            b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            b.location.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesTown = townFilter === 'All' || b.town === townFilter;
        const matchesType = typeFilter === 'All' || b.type === typeFilter;
        const matchesStatus = statusFilter === 'All' || r.bucket === statusFilter;
        return matchesSearch && matchesTown && matchesType && matchesStatus;
    });

    const totals = useMemo(() => {
        const totalCapacity = rows.reduce((s, r) => s + r.capacity, 0);
        const totalRented = rows.reduce((s, r) => s + r.rented, 0);
        const totalAvailable = totalCapacity - totalRented;
        const occupancy = totalCapacity > 0 ? (totalRented / totalCapacity) * 100 : 0;

        const staticRows = rows.filter(r => r.billboard.type === BillboardType.Static);
        const ledRows = rows.filter(r => r.billboard.type === BillboardType.LED);
        const staticCap = staticRows.reduce((s, r) => s + r.capacity, 0);
        const staticRented = staticRows.reduce((s, r) => s + r.rented, 0);
        const ledCap = ledRows.reduce((s, r) => s + r.capacity, 0);
        const ledRented = ledRows.reduce((s, r) => s + r.rented, 0);

        return {
            totalCapacity, totalRented, totalAvailable, occupancy,
            staticCap, staticRented, staticAvailable: staticCap - staticRented,
            ledCap, ledRented, ledAvailable: ledCap - ledRented,
            billboards: rows.length,
        };
    }, [rows]);

    // Per-town breakdown — sorted by most capacity first.
    const townBreakdown = useMemo(() => {
        const map = new Map<string, { town: string; capacity: number; rented: number }>();
        for (const r of rows) {
            const cur = map.get(r.billboard.town) || { town: r.billboard.town, capacity: 0, rented: 0 };
            cur.capacity += r.capacity;
            cur.rented += r.rented;
            map.set(r.billboard.town, cur);
        }
        return [...map.values()].sort((a, b) => b.capacity - a.capacity);
    }, [rows]);

    const handleDownload = () => {
        generateAvailabilityReportPDF(filtered.map(r => ({
            name: r.billboard.name,
            location: `${r.billboard.location}, ${r.billboard.town}`,
            type: r.billboard.type,
            capacity: r.capacity,
            rented: r.rented,
            available: r.available,
            status: bucketStyles[r.bucket].label,
            detail: r.detail,
        })), {
            totalCapacity: totals.totalCapacity,
            totalRented: totals.totalRented,
            totalAvailable: totals.totalAvailable,
            occupancy: totals.occupancy,
        }, townBreakdown);
    };

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 mb-2">Availability Report</h2>
                    <p className="text-slate-500 font-medium">Live inventory, side &amp; slot occupancy across the fleet</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-4 items-center w-full sm:w-auto">
                    <div className="relative group w-full sm:w-64">
                        <Search className="absolute left-3 top-2.5 text-slate-400 group-focus-within:text-slate-800 transition-colors" size={18} />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            placeholder="Search asset..."
                            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-full bg-white outline-none focus:border-slate-800 transition-all text-sm shadow-sm"
                        />
                    </div>
                    <button
                        onClick={handleDownload}
                        disabled={filtered.length === 0}
                        className="bg-slate-900 text-white px-5 py-2.5 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-slate-800 shadow-lg transition-all hover:scale-105 flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-40 disabled:hover:scale-100"
                    >
                        <Download size={16} /> Download Report
                    </button>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                    <div className="p-3 bg-slate-100 text-slate-600 rounded-xl"><Layers size={24} /></div>
                    <div>
                        <p className="text-xs font-bold uppercase text-slate-400">Total Capacity</p>
                        <h3 className="text-2xl font-black text-slate-900">{totals.totalCapacity}</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">{totals.billboards} assets</p>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><CheckCircle size={24} /></div>
                    <div>
                        <p className="text-xs font-bold uppercase text-slate-400">Available</p>
                        <h3 className="text-2xl font-black text-emerald-600">{totals.totalAvailable}</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">sides &amp; slots free</p>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                    <div className="p-3 bg-red-50 text-red-600 rounded-xl"><CircleSlash size={24} /></div>
                    <div>
                        <p className="text-xs font-bold uppercase text-slate-400">Rented</p>
                        <h3 className="text-2xl font-black text-red-600">{totals.totalRented}</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">sides &amp; slots taken</p>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl"><TrendingUp size={24} /></div>
                    <div>
                        <p className="text-xs font-bold uppercase text-slate-400">Occupancy</p>
                        <h3 className="text-2xl font-black text-slate-900">{totals.occupancy.toFixed(1)}%</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">fleet-wide utilisation</p>
                    </div>
                </div>
            </div>

            {/* Type split + town breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">By Type</h3>
                    <div className="space-y-4">
                        {[
                            { label: 'Static (Sides)', cap: totals.staticCap, rented: totals.staticRented, free: totals.staticAvailable, color: 'bg-orange-500' },
                            { label: 'LED (Slots)', cap: totals.ledCap, rented: totals.ledRented, free: totals.ledAvailable, color: 'bg-indigo-500' },
                        ].map(t => {
                            const pct = t.cap > 0 ? (t.rented / t.cap) * 100 : 0;
                            return (
                                <div key={t.label}>
                                    <div className="flex justify-between text-sm mb-1.5">
                                        <span className="font-bold text-slate-700">{t.label}</span>
                                        <span className="text-slate-500"><span className="font-bold text-slate-900">{t.rented}</span> / {t.cap} rented · {t.free} free</span>
                                    </div>
                                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                        <div className={`h-full ${t.color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">By Town</h3>
                    {townBreakdown.length === 0 ? (
                        <p className="text-sm text-slate-400 italic">No assets yet.</p>
                    ) : (
                        <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                            {townBreakdown.map(t => {
                                const pct = t.capacity > 0 ? (t.rented / t.capacity) * 100 : 0;
                                return (
                                    <div key={t.town}>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="font-medium text-slate-700">{t.town}</span>
                                            <span className="text-xs text-slate-500">{t.rented}/{t.capacity} · {pct.toFixed(0)}%</span>
                                        </div>
                                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-slate-900 rounded-full" style={{ width: `${pct}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Filter bar */}
            <div className="flex flex-wrap gap-3 items-center">
                <select value={townFilter} onChange={e => setTownFilter(e.target.value)} className="text-sm border border-slate-200 rounded-full bg-white px-4 py-2 shadow-sm focus:border-slate-800 outline-none font-medium">
                    <option value="All">All Towns</option>
                    {ZIM_TOWNS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)} className="text-sm border border-slate-200 rounded-full bg-white px-4 py-2 shadow-sm focus:border-slate-800 outline-none font-medium">
                    <option value="All">All Types</option>
                    <option value={BillboardType.Static}>Static</option>
                    <option value={BillboardType.LED}>LED</option>
                </select>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="text-sm border border-slate-200 rounded-full bg-white px-4 py-2 shadow-sm focus:border-slate-800 outline-none font-medium">
                    <option value="All">All Statuses</option>
                    <option value="Available">Available</option>
                    <option value="Partial">Partial</option>
                    <option value="Booked">Fully Booked</option>
                </select>
                <span className="text-xs text-slate-400 font-medium ml-auto">Showing {filtered.length} of {rows.length}</span>
            </div>

            {/* Table */}
            <div className="bg-white shadow-sm rounded-2xl border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600 min-w-[900px]">
                        <thead className="bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Asset</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Location</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Type</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-right">Capacity</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-right">Rented</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider text-right">Available</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Status</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase text-slate-400 tracking-wider">Detail</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filtered.length === 0 && (
                                <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-400 italic">No billboards match the current filters.</td></tr>
                            )}
                            {filtered.map(r => {
                                const style = bucketStyles[r.bucket];
                                return (
                                    <tr key={r.billboard.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4 font-bold text-slate-900">{r.billboard.name}</td>
                                        <td className="px-6 py-4">{r.billboard.location}, {r.billboard.town}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${r.billboard.type === BillboardType.LED ? 'bg-indigo-50 text-indigo-700' : 'bg-orange-50 text-orange-700'}`}>
                                                {r.billboard.type}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono">{r.capacity}</td>
                                        <td className="px-6 py-4 text-right font-mono text-red-600">{r.rented}</td>
                                        <td className="px-6 py-4 text-right font-mono text-emerald-600">{r.available}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${style.bg} ${style.text}`}>
                                                {style.label}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 truncate max-w-[260px] text-xs text-slate-500">{r.detail}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
