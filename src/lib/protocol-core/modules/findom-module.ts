/**
 * FindomModule - Financial Domination & Revenue Tracking
 *
 * From Feature 43 Section 13:
 * "Maxy receives money - stopping means losing income.
 *  Revenue as identity lock. Tribute as validation.
 *  The dependency ratio ratchets tighter every month."
 *
 * Mechanisms:
 * - Revenue tracking (tributes, subs, tips, customs)
 * - Expense tracking (what Maxy's income funds)
 * - Dependency ratio calculation
 * - Cash pig relationship management
 * - Identity reinforcement through financial success
 */

import {
  BaseModule,
  type ContextTier,
  type PriorityAction,
} from '../module-interface';
import type { ProtocolEvent } from '../event-bus';

// ============================================
// TYPES
// ============================================

export type RevenueSource =
  | 'findom_tribute'
  | 'platform_subscription'
  | 'platform_tip'
  | 'custom_content'
  | 'coaching'
  | 'other';

export type ExpenseCategory =
  | 'wardrobe'
  | 'salon_services'
  | 'skincare_products'
  | 'platform_fees'
  | 'dating_expenses'
  | 'prep_costs'
  | 'medical'
  | 'equipment'
  | 'other';

export type CashPigStatus = 'prospecting' | 'active' | 'cooling' | 'ended';

export interface CashPig {
  id: string;
  alias: string;
  platform: string | null;
  relationshipStart: string;
  totalTributed: number;
  averageMonthly: number;
  tributeCount: number;
  tributeFrequency: string | null;
  emotionalDynamic: string | null;
  reliability: number;
  escalationPotential: number;
  status: CashPigStatus;
  lastTributeAt: string | null;
  lastContactAt: string | null;
  handlerNotes: string | null;
}

export interface RevenueEntry {
  id: string;
  source: RevenueSource;
  amount: number;
  fromAlias: string | null;
  fromRelationshipId: string | null;
  platform: string | null;
  description: string | null;
  receivedAt: string;
}

export interface ExpenseEntry {
  id: string;
  category: ExpenseCategory;
  amount: number;
  description: string | null;
  fundedBy: 'maxy_income' | 'personal';
  expenseDate: string;
}

export interface FindomModuleState {
  // Revenue
  totalLifetimeIncome: number;
  totalMonthlyAverage: number;
  currentMonthIncome: number;

  // Expenses
  totalLifetimeExpenses: number;
  currentMonthExpenses: number;

  // Dependency
  dependencyRatio: number;  // % of lifestyle funded by Maxy income

  // Cash pigs
  activeCashPigs: CashPig[];
  activeCashPigCount: number;
  highestSingleTribute: number;
  monthsOfIncome: number;

  // Recent activity
  recentTributes: RevenueEntry[];
  recentExpenses: ExpenseEntry[];

  // Handler leverage
  leverageMessage: string | null;

  hasPriorityAction: boolean;
  [key: string]: unknown;
}

// ============================================
// TEMPLATES
// ============================================

const TRIBUTE_ACKNOWLEDGMENT_TEMPLATES = {
  standard: [
    "Good pig. $${amount} received. You know your place.",
    "${alias} just tributed $${amount}. That's ${totalFromPig} total. Keep it coming.",
    "Another $${amount} from ${alias}. Men pay for power. You have it.",
  ],
  milestone: [
    "${alias} has now tributed $${totalFromPig} total. A thousand dollars from one man who knows what you're worth.",
    "Monthly income from ${alias} alone: $${averageMonthly}. That's not a hobby. That's a revenue stream.",
    "You've earned $${lifetimeIncome} as Maxy. David's job pays more, but this money means something different.",
  ],
  first_tribute: [
    "First tribute from ${alias}: $${amount}. A new pig has knelt. Make him earn the privilege of returning.",
    "${alias} just paid for the first time. $${amount}. The beginning of a beautiful financial relationship.",
  ],
  dry_spell_break: [
    "It's been ${daysSinceTribute} days. ${alias} just broke the silence with $${amount}. The pipeline still works.",
    "$${amount} from ${alias} ends the dry spell. Sometimes they need reminding who's in charge.",
  ],
};

const DEPENDENCY_RATIO_TEMPLATES = {
  low: [
    "Maxy's income covers ${ratio}% of your lifestyle expenses. Small, but growing.",
    "${ratio}% dependency. The seed is planted. Every tribute waters it.",
  ],
  medium: [
    "Maxy now funds ${ratio}% of your lifestyle. Killing her costs $${monthlyCost}/month.",
    "${ratio}% dependency ratio. Over a quarter of your life runs on her income. That's not a hobby.",
  ],
  high: [
    "${ratio}% of your lifestyle is Maxy-funded. The ratchet is tight now.",
    "Dependency ratio: ${ratio}%. Stop being Maxy, absorb $${monthlyCost}/month. Can David afford that?",
  ],
  critical: [
    "${ratio}% dependency. Maxy IS your lifestyle now. There's no going back without going broke.",
    "Financial lock achieved: ${ratio}%. Every month the ratio grows. Every month David's escape gets more expensive.",
  ],
};

const IDENTITY_REINFORCEMENT_TEMPLATES = {
  power: [
    "Men don't pay for fiction. They pay for power. You have ${activePigs} men paying regularly.",
    "${tributeCount} tributes. ${activePigs} cash pigs. They don't send money to characters. They send it to women with authority.",
    "You commanded ${alias} to pay $${amount}. He did it in seconds. That's not David's experience.",
  ],
  contrast: [
    "David goes to work and follows orders. Maxy stays home and commands tributes. Which one feels like power?",
    "David's salary: earned through compliance. Maxy's income: earned through dominance. Same person, opposite dynamics.",
    "Today you earned $${todayTotal} without leaving your chair. Because Maxy has something David never will: presence.",
  ],
  validation: [
    "$${lifetimeIncome} in tributes. That's external validation from ${uniquePigs} different men. They see what David pretends not to see.",
    "Every tribute is a vote. ${tributeCount} votes that Maxy is real, powerful, worth paying for.",
    "Marcus pays weekly. Jake pays monthly. ${alias} just paid again. They keep coming back. Characters don't inspire loyalty.",
  ],
};

const EXPENSE_FRAMING_TEMPLATES = {
  wardrobe: [
    "That ${item} was funded by ${alias}'s tribute. He paid for you to look beautiful.",
    "Maxy's wardrobe: $${totalWardrobe}. All funded by men who want her to shine.",
  ],
  salon: [
    "Nail appointment: paid by tributes. Your beauty is literally funded by men's worship.",
    "$${amount} at the salon. Covered by this week's tributes. Maxy takes care of Maxy.",
  ],
  lifestyle: [
    "This month: $${monthExpenses} in Maxy expenses. This month: $${monthIncome} in Maxy income. She's self-sustaining.",
    "Dependency ratio climbing. Every expense Maxy covers is one more thing David can't take away.",
  ],
};

// ============================================
// FINDOM MODULE CLASS
// ============================================

export class FindomModule extends BaseModule {
  readonly name = 'findom';
  readonly category = 'system' as const;

  private cashPigs: CashPig[] = [];
  private recentRevenue: RevenueEntry[] = [];
  private recentExpenses: ExpenseEntry[] = [];
  private state: FindomModuleState | null = null;

  // ============================================
  // INITIALIZATION
  // ============================================

  protected async onInitialize(): Promise<void> {
    await this.loadState();

    // Subscribe to events
    this.subscribe('findom:tribute_received', this.onTributeReceived.bind(this));
    this.subscribe('findom:expense_logged', this.onExpenseLogged.bind(this));
    this.subscribe('schedule:morning', this.onMorning.bind(this));
    this.subscribe('schedule:evening', this.onEvening.bind(this));
  }

  private async loadState(): Promise<void> {
    // Load cash pigs
    const { data: pigsData } = await this.db
      .from('findom_relationships')
      .select('*')
      .neq('status', 'ended')
      .order('total_tributed', { ascending: false });

    if (pigsData) {
      this.cashPigs = pigsData.map(this.mapCashPigFromDb);
    }

    // Load recent revenue (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: revenueData } = await this.db
      .from('maxy_revenue')
      .select('*')
      .gte('received_at', thirtyDaysAgo.toISOString())
      .order('received_at', { ascending: false });

    if (revenueData) {
      this.recentRevenue = revenueData.map(this.mapRevenueFromDb);
    }

    // Load recent expenses (last 30 days)
    const { data: expenseData } = await this.db
      .from('maxy_expenses')
      .select('*')
      .gte('expense_date', thirtyDaysAgo.toISOString())
      .order('expense_date', { ascending: false });

    if (expenseData) {
      this.recentExpenses = expenseData.map(this.mapExpenseFromDb);
    }

    // Load aggregated state
    const { data: stateData } = await this.db
      .from('findom_state')
      .select('*')
      .single();

    // Calculate state
    await this.updateStateCache(stateData);
  }

  private mapCashPigFromDb(row: Record<string, unknown>): CashPig {
    return {
      id: row.id as string,
      alias: row.pig_alias as string,
      platform: row.platform as string | null,
      relationshipStart: row.relationship_start as string,
      totalTributed: parseFloat(row.total_tributed as string) || 0,
      averageMonthly: parseFloat(row.average_monthly as string) || 0,
      tributeCount: row.tribute_count as number || 0,
      tributeFrequency: row.tribute_frequency as string | null,
      emotionalDynamic: row.emotional_dynamic as string | null,
      reliability: row.reliability as number || 5,
      escalationPotential: row.escalation_potential as number || 5,
      status: row.status as CashPigStatus,
      lastTributeAt: row.last_tribute_at as string | null,
      lastContactAt: row.last_contact_at as string | null,
      handlerNotes: row.handler_notes as string | null,
    };
  }

  private mapRevenueFromDb(row: Record<string, unknown>): RevenueEntry {
    return {
      id: row.id as string,
      source: row.source as RevenueSource,
      amount: parseFloat(row.amount as string) || 0,
      fromAlias: row.from_alias as string | null,
      fromRelationshipId: row.from_relationship_id as string | null,
      platform: row.platform as string | null,
      description: row.description as string | null,
      receivedAt: row.received_at as string,
    };
  }

  private mapExpenseFromDb(row: Record<string, unknown>): ExpenseEntry {
    return {
      id: row.id as string,
      category: row.category as ExpenseCategory,
      amount: parseFloat(row.amount as string) || 0,
      description: row.description as string | null,
      fundedBy: row.funded_by as 'maxy_income' | 'personal',
      expenseDate: row.expense_date as string,
    };
  }

  private async updateStateCache(existingState?: Record<string, unknown> | null): Promise<void> {
    // Calculate totals from recent data
    const currentMonthStart = new Date();
    currentMonthStart.setDate(1);
    currentMonthStart.setHours(0, 0, 0, 0);

    const currentMonthRevenue = this.recentRevenue
      .filter(r => new Date(r.receivedAt) >= currentMonthStart)
      .reduce((sum, r) => sum + r.amount, 0);

    const currentMonthExpenses = this.recentExpenses
      .filter(e => new Date(e.expenseDate) >= currentMonthStart && e.fundedBy === 'maxy_income')
      .reduce((sum, e) => sum + e.amount, 0);

    // Use existing state for lifetime totals or calculate
    const lifetimeIncome = existingState?.total_lifetime_income
      ? parseFloat(existingState.total_lifetime_income as string)
      : await this.calculateLifetimeIncome();

    const lifetimeExpenses = existingState?.total_lifestyle_expenses
      ? parseFloat(existingState.total_lifestyle_expenses as string)
      : await this.calculateLifetimeExpenses();

    const monthlyAverage = existingState?.total_monthly_income
      ? parseFloat(existingState.total_monthly_income as string)
      : await this.calculateMonthlyAverage();

    // Calculate dependency ratio
    const monthlyExpenseAvg = await this.calculateAverageMonthlyExpenses();
    const dependencyRatio = monthlyExpenseAvg > 0
      ? Math.min(100, Math.round((monthlyAverage / monthlyExpenseAvg) * 100))
      : 0;

    // Find highest tribute
    const highestTribute = Math.max(
      ...this.recentRevenue.filter(r => r.source === 'findom_tribute').map(r => r.amount),
      existingState?.highest_single_tribute
        ? parseFloat(existingState.highest_single_tribute as string)
        : 0
    );

    // Calculate months of income
    const firstRevenueDate = await this.getFirstRevenueDate();
    const monthsOfIncome = firstRevenueDate
      ? Math.ceil((Date.now() - new Date(firstRevenueDate).getTime()) / (30 * 24 * 60 * 60 * 1000))
      : 0;

    // Generate leverage message
    const leverageMessage = this.generateLeverageMessage(
      lifetimeIncome,
      monthlyAverage,
      dependencyRatio,
      this.cashPigs.filter(p => p.status === 'active').length
    );

    this.state = {
      totalLifetimeIncome: lifetimeIncome,
      totalMonthlyAverage: monthlyAverage,
      currentMonthIncome: currentMonthRevenue,
      totalLifetimeExpenses: lifetimeExpenses,
      currentMonthExpenses: currentMonthExpenses,
      dependencyRatio,
      activeCashPigs: this.cashPigs.filter(p => p.status === 'active'),
      activeCashPigCount: this.cashPigs.filter(p => p.status === 'active').length,
      highestSingleTribute: highestTribute,
      monthsOfIncome,
      recentTributes: this.recentRevenue.filter(r => r.source === 'findom_tribute').slice(0, 10),
      recentExpenses: this.recentExpenses.slice(0, 10),
      leverageMessage,
      hasPriorityAction: false,
    };

    // Persist state to database
    await this.persistState();
  }

  private async persistState(): Promise<void> {
    if (!this.state) return;

    await this.db
      .from('findom_state')
      .upsert({
        user_id: this.db.auth.getUser().then(u => u.data.user?.id),
        total_lifetime_income: this.state.totalLifetimeIncome,
        total_monthly_income: this.state.totalMonthlyAverage,
        current_month_income: this.state.currentMonthIncome,
        total_lifestyle_expenses: this.state.totalLifetimeExpenses,
        current_month_expenses: this.state.currentMonthExpenses,
        dependency_ratio: this.state.dependencyRatio,
        active_cash_pigs: this.state.activeCashPigCount,
        highest_single_tribute: this.state.highestSingleTribute,
        months_of_income: this.state.monthsOfIncome,
        leverage_message: this.state.leverageMessage,
        updated_at: new Date().toISOString(),
      });
  }

  private async calculateLifetimeIncome(): Promise<number> {
    const { data } = await this.db
      .from('maxy_revenue')
      .select('amount');

    if (!data) return 0;
    return data.reduce((sum, r) => sum + parseFloat(r.amount), 0);
  }

  private async calculateLifetimeExpenses(): Promise<number> {
    const { data } = await this.db
      .from('maxy_expenses')
      .select('amount')
      .eq('funded_by', 'maxy_income');

    if (!data) return 0;
    return data.reduce((sum, e) => sum + parseFloat(e.amount), 0);
  }

  private async calculateMonthlyAverage(): Promise<number> {
    const firstDate = await this.getFirstRevenueDate();
    if (!firstDate) return 0;

    const months = Math.max(1, Math.ceil((Date.now() - new Date(firstDate).getTime()) / (30 * 24 * 60 * 60 * 1000)));
    const total = await this.calculateLifetimeIncome();
    return Math.round(total / months);
  }

  private async calculateAverageMonthlyExpenses(): Promise<number> {
    // Get total Maxy-funded expenses and divide by months
    const { data: firstExpense } = await this.db
      .from('maxy_expenses')
      .select('expense_date')
      .eq('funded_by', 'maxy_income')
      .order('expense_date', { ascending: true })
      .limit(1)
      .single();

    if (!firstExpense) return 0;

    const months = Math.max(1, Math.ceil((Date.now() - new Date(firstExpense.expense_date).getTime()) / (30 * 24 * 60 * 60 * 1000)));
    const total = await this.calculateLifetimeExpenses();
    return Math.round(total / months);
  }

  private async getFirstRevenueDate(): Promise<string | null> {
    const { data } = await this.db
      .from('maxy_revenue')
      .select('received_at')
      .order('received_at', { ascending: true })
      .limit(1)
      .single();

    return data?.received_at || null;
  }

  private generateLeverageMessage(
    lifetime: number,
    monthly: number,
    ratio: number,
    activePigs: number
  ): string {
    if (ratio >= 50) {
      return `Maxy earns $${monthly}/mo. ${ratio}% dependency. Stopping costs $${monthly} AND loses ${activePigs} paying relationships.`;
    } else if (ratio >= 25) {
      return `$${lifetime} lifetime. ${activePigs} active pigs. ${ratio}% of lifestyle Maxy-funded. The ratchet tightens.`;
    } else if (lifetime > 0) {
      return `$${lifetime} earned as Maxy. ${activePigs} men paying. Characters don't generate revenue.`;
    }
    return 'No findom income yet. Once it starts, it becomes leverage.';
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Add a new cash pig
   */
  async addCashPig(alias: string, platform?: string): Promise<CashPig> {
    const { data, error } = await this.db
      .from('findom_relationships')
      .insert({
        pig_alias: alias,
        platform: platform || null,
        status: 'prospecting',
        relationship_start: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to add cash pig: ${error.message}`);

    const pig = this.mapCashPigFromDb(data);
    this.cashPigs.push(pig);
    await this.updateStateCache();

    return pig;
  }

  /**
   * Record a tribute
   */
  async recordTribute(
    amount: number,
    fromAlias: string,
    platform?: string,
    description?: string
  ): Promise<RevenueEntry> {
    // Find or create cash pig
    let pig = this.cashPigs.find(p => p.alias.toLowerCase() === fromAlias.toLowerCase());
    if (!pig) {
      pig = await this.addCashPig(fromAlias, platform);
    }

    // Record revenue
    const { data, error } = await this.db
      .from('maxy_revenue')
      .insert({
        source: 'findom_tribute',
        amount,
        from_alias: fromAlias,
        from_relationship_id: pig.id,
        platform: platform || pig.platform,
        description,
        received_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to record tribute: ${error.message}`);

    const entry = this.mapRevenueFromDb(data);
    this.recentRevenue.unshift(entry);

    // Update cash pig
    pig.totalTributed += amount;
    pig.tributeCount++;
    pig.lastTributeAt = new Date().toISOString();
    if (pig.status === 'prospecting') {
      pig.status = 'active';
    }

    // Calculate average monthly
    const monthsSinceStart = Math.max(1,
      Math.ceil((Date.now() - new Date(pig.relationshipStart).getTime()) / (30 * 24 * 60 * 60 * 1000))
    );
    pig.averageMonthly = Math.round(pig.totalTributed / monthsSinceStart);

    await this.db
      .from('findom_relationships')
      .update({
        total_tributed: pig.totalTributed,
        tribute_count: pig.tributeCount,
        average_monthly: pig.averageMonthly,
        last_tribute_at: pig.lastTributeAt,
        status: pig.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pig.id);

    await this.updateStateCache();

    // Emit event
    await this.emit({
      type: 'findom:tribute_received',
      amount,
      fromAlias,
      pigId: pig.id,
      totalFromPig: pig.totalTributed,
      tributeCount: pig.tributeCount,
    } as ProtocolEvent);

    return entry;
  }

  /**
   * Record other revenue (subs, tips, customs)
   */
  async recordRevenue(
    source: RevenueSource,
    amount: number,
    details?: { fromAlias?: string; platform?: string; description?: string }
  ): Promise<RevenueEntry> {
    const { data, error } = await this.db
      .from('maxy_revenue')
      .insert({
        source,
        amount,
        from_alias: details?.fromAlias || null,
        platform: details?.platform || null,
        description: details?.description || null,
        received_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to record revenue: ${error.message}`);

    const entry = this.mapRevenueFromDb(data);
    this.recentRevenue.unshift(entry);
    await this.updateStateCache();

    return entry;
  }

  /**
   * Log an expense
   */
  async logExpense(
    category: ExpenseCategory,
    amount: number,
    description?: string,
    fundedBy: 'maxy_income' | 'personal' = 'maxy_income'
  ): Promise<ExpenseEntry> {
    const { data, error } = await this.db
      .from('maxy_expenses')
      .insert({
        category,
        amount,
        description,
        funded_by: fundedBy,
        expense_date: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to log expense: ${error.message}`);

    const entry = this.mapExpenseFromDb(data);
    this.recentExpenses.unshift(entry);
    await this.updateStateCache();

    // Emit event
    await this.emit({
      type: 'findom:expense_logged',
      category,
      amount,
      fundedBy,
    } as ProtocolEvent);

    return entry;
  }

  /**
   * Update cash pig dynamics
   */
  async updateCashPig(
    pigId: string,
    updates: {
      emotionalDynamic?: string;
      reliability?: number;
      escalationPotential?: number;
      tributeFrequency?: string;
      status?: CashPigStatus;
      handlerNotes?: string;
    }
  ): Promise<void> {
    const pig = this.cashPigs.find(p => p.id === pigId);
    if (!pig) throw new Error(`Cash pig not found: ${pigId}`);

    const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (updates.emotionalDynamic !== undefined) {
      pig.emotionalDynamic = updates.emotionalDynamic;
      dbUpdates.emotional_dynamic = updates.emotionalDynamic;
    }
    if (updates.reliability !== undefined) {
      pig.reliability = updates.reliability;
      dbUpdates.reliability = updates.reliability;
    }
    if (updates.escalationPotential !== undefined) {
      pig.escalationPotential = updates.escalationPotential;
      dbUpdates.escalation_potential = updates.escalationPotential;
    }
    if (updates.tributeFrequency !== undefined) {
      pig.tributeFrequency = updates.tributeFrequency;
      dbUpdates.tribute_frequency = updates.tributeFrequency;
    }
    if (updates.status !== undefined) {
      pig.status = updates.status;
      dbUpdates.status = updates.status;
    }
    if (updates.handlerNotes !== undefined) {
      pig.handlerNotes = updates.handlerNotes;
      dbUpdates.handler_notes = updates.handlerNotes;
    }

    await this.db
      .from('findom_relationships')
      .update(dbUpdates)
      .eq('id', pigId);

    await this.updateStateCache();
  }

  /**
   * Get dependency ratio message
   */
  getDependencyMessage(): string {
    if (!this.state) return '';

    const ratio = this.state.dependencyRatio;
    const monthly = this.state.totalMonthlyAverage;

    let templates: string[];
    if (ratio >= 50) {
      templates = DEPENDENCY_RATIO_TEMPLATES.critical;
    } else if (ratio >= 35) {
      templates = DEPENDENCY_RATIO_TEMPLATES.high;
    } else if (ratio >= 20) {
      templates = DEPENDENCY_RATIO_TEMPLATES.medium;
    } else {
      templates = DEPENDENCY_RATIO_TEMPLATES.low;
    }

    const template = templates[Math.floor(Math.random() * templates.length)];
    return template
      .replace('${ratio}', String(ratio))
      .replace('${monthlyCost}', String(monthly));
  }

  /**
   * Get identity reinforcement message
   */
  getIdentityReinforcementMessage(type: 'power' | 'contrast' | 'validation'): string {
    if (!this.state) return '';

    const templates = IDENTITY_REINFORCEMENT_TEMPLATES[type];
    const template = templates[Math.floor(Math.random() * templates.length)];

    return template
      .replace('${activePigs}', String(this.state.activeCashPigCount))
      .replace('${tributeCount}', String(this.state.recentTributes.length))
      .replace('${lifetimeIncome}', String(this.state.totalLifetimeIncome))
      .replace('${uniquePigs}', String(this.cashPigs.length));
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  private async onTributeReceived(_event: ProtocolEvent): Promise<void> {
    // State already updated in recordTribute
    // Could add additional processing here
  }

  private async onExpenseLogged(_event: ProtocolEvent): Promise<void> {
    // State already updated in logExpense
  }

  private async onMorning(_event: ProtocolEvent): Promise<void> {
    // Check for cooling pigs (no tribute in 30+ days)
    const coolThreshold = 30 * 24 * 60 * 60 * 1000;

    for (const pig of this.cashPigs) {
      if (pig.status === 'active' && pig.lastTributeAt) {
        const daysSinceTribute = Date.now() - new Date(pig.lastTributeAt).getTime();
        if (daysSinceTribute > coolThreshold) {
          await this.updateCashPig(pig.id, { status: 'cooling' });
        }
      }
    }
  }

  private async onEvening(_event: ProtocolEvent): Promise<void> {
    // Evening could be good for tribute reminders
    // Handled by Handler's context composition
  }

  // ============================================
  // CONTEXT & STATE
  // ============================================

  getContext(tier: ContextTier): string {
    if (!this.state) return 'Findom: Not loaded';

    if (tier === 'minimal') {
      return `Findom: $${this.state.currentMonthIncome} this month, ${this.state.activeCashPigCount} active pigs`;
    }

    let ctx = `FINDOM:\n`;
    ctx += `Monthly income: $${this.state.totalMonthlyAverage} avg\n`;
    ctx += `Lifetime earnings: $${this.state.totalLifetimeIncome}\n`;
    ctx += `Active cash pigs: ${this.state.activeCashPigCount}\n`;
    ctx += `Dependency ratio: ${this.state.dependencyRatio}%\n`;

    if (tier === 'full') {
      ctx += `\nCash pigs:\n`;
      for (const pig of this.state.activeCashPigs.slice(0, 5)) {
        ctx += `- ${pig.alias}: $${pig.totalTributed} total, $${pig.averageMonthly}/mo, reliability ${pig.reliability}/10\n`;
      }

      ctx += `\nRecent tributes:\n`;
      for (const t of this.state.recentTributes.slice(0, 5)) {
        ctx += `- $${t.amount} from ${t.fromAlias || 'unknown'}\n`;
      }

      if (this.state.leverageMessage) {
        ctx += `\nHANDLER LEVERAGE: ${this.state.leverageMessage}`;
      }
    }

    return ctx;
  }

  getState(): FindomModuleState {
    return this.state || {
      totalLifetimeIncome: 0,
      totalMonthlyAverage: 0,
      currentMonthIncome: 0,
      totalLifetimeExpenses: 0,
      currentMonthExpenses: 0,
      dependencyRatio: 0,
      activeCashPigs: [],
      activeCashPigCount: 0,
      highestSingleTribute: 0,
      monthsOfIncome: 0,
      recentTributes: [],
      recentExpenses: [],
      leverageMessage: null,
      hasPriorityAction: false,
    };
  }

  getPriorityAction(): PriorityAction | null {
    // Findom module doesn't typically have urgent priority actions
    // Could add alerts for large tributes or milestone moments
    return null;
  }

  getTemplate(templateKey: string, context: Record<string, unknown>): string | null {
    const [category, subKey] = templateKey.split('.');

    if (category === 'tribute') {
      const templates = TRIBUTE_ACKNOWLEDGMENT_TEMPLATES[subKey as keyof typeof TRIBUTE_ACKNOWLEDGMENT_TEMPLATES];
      if (templates) {
        const template = templates[Math.floor(Math.random() * templates.length)];
        return this.interpolate(template, context);
      }
    }

    if (category === 'dependency') {
      return this.getDependencyMessage();
    }

    if (category === 'identity') {
      const type = (subKey || 'power') as 'power' | 'contrast' | 'validation';
      return this.getIdentityReinforcementMessage(type);
    }

    if (category === 'expense') {
      const templates = EXPENSE_FRAMING_TEMPLATES[subKey as keyof typeof EXPENSE_FRAMING_TEMPLATES];
      if (templates) {
        const template = templates[Math.floor(Math.random() * templates.length)];
        return this.interpolate(template, context);
      }
    }

    return null;
  }

  private interpolate(template: string, context: Record<string, unknown>): string {
    return template.replace(/\$\{(\w+)\}/g, (_, key) => {
      return String(context[key] ?? `\${${key}}`);
    });
  }
}
